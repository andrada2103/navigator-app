//sistem rutare - A* in oras + OSRM in afara
//rutare pentru masina - 3 rute: scurta, rapida, sigura
//rutare pentru mers pe jos si bicicleta
//opriri intermediare pentru masina
//integrare cu backend php care ruleaza A* pe graful rutier
//1. backend-ul incarca graful rutier al brasovului
//2. a* este implementat in python si apelat prin php
//3. pentru rutele cu masina, backend-ul intoarce 3 rute - distanta minima, timp minim si safe
//4. pentru mers pe jos/bicicleta intoarce o singura ruta
import { getMap, createMarker } from "../core/map.js";
import { showMessage } from "../core/utils.js";
import { API_PROXY } from "../config/constants.js";
import { getUserCoords } from "./geolocation.js";
import { trackRoute } from "./history.js";

let startMarker = null; //punctul de plecare
let endMarker = null; //punctul de destinatie
let routingControl = null; //obiectul rutei curente
let academicRouteLayers = []; //array cu rutele pentru masina
let intermediateStops = []; //array cu opririle intermediare

export function initRouting() {
  initIntegratedRouting();
}

function initIntegratedRouting() {
  const toggleRoutePanelBtn = document.getElementById("toggleRoutePanelBtn");
  const routePanel = document.getElementById("routePanel");
  const startPointInput = document.getElementById("startPoint");
  const endPointInput = document.getElementById("endPoint");
  const startLocationBtn = document.getElementById("startLocationBtn");
  const addStopBtn = document.getElementById("addStopBtn");
  const calculateRouteBtn = document.getElementById("calculateRouteBtn");
  const clearRouteBtn = document.getElementById("clearRouteBtn");
  const transportType = document.getElementById("transportType");

  if (!toggleRoutePanelBtn || !routePanel) return;

  let isRoutePanelOpen = false;

  //toggle panel
  toggleRoutePanelBtn.addEventListener("click", function () {
    isRoutePanelOpen = !isRoutePanelOpen;

    if (isRoutePanelOpen) {
      routePanel.style.display = "block";
      this.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13H5v-2h14v2z"/>
        </svg>
        <span>Închide</span>
      `;

      const busRoutePanel = document.getElementById("busRoutePanel");
      const busRouteBtn = document.getElementById("toggleBusRouteBtn");

      if (busRoutePanel && busRoutePanel.style.display === "block") {
        busRoutePanel.style.display = "none";
        if (busRouteBtn) {
          busRouteBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10z"/>
          </svg>
          <span>Autobuz</span>
        `;
        }
      }
      const coords = getUserCoords();
      if (coords) {
        const startPointInput = document.getElementById("startPoint");
        if (startPointInput) {
          startPointInput.value = "Locația ta curentă";
          setStartPoint(coords[0], coords[1]);
        }
      }

      setTimeout(() => {
        const endPointInput = document.getElementById("endPoint");
        if (endPointInput) endPointInput.focus();
      }, 100);
    } else {
      routePanel.style.display = "none";
      this.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            <span>Rută</span>
        `;
    }
    hideAllRouteSearchResults();
  });

  //locatie curenta
  startLocationBtn?.addEventListener("click", function () {
    const coords = getUserCoords();
    if (coords) {
      startPointInput.value = "Locația ta curentă";
      setStartPoint(coords[0], coords[1]);
      showMessage("Punct start setat la locația ta", "success");
    } else {
      showMessage("Locația ta nu este disponibilă", "error");
    }
  });

  //adauga oprire
  addStopBtn?.addEventListener("click", function () {
    if (transportType.value !== "driving") {
      return;
    }
    addIntermediateStop();
  });

  //schimbare tip transport
  transportType?.addEventListener("change", function () {
    if (this.value !== "driving") {
      clearIntermediateStops();
    }
    updateCalculateButton();
  });

  //cautare start
  startPointInput?.addEventListener("input", function () {
    clearTimeout(window.startSearchTimeout);
    window.startSearchTimeout = setTimeout(() => {
      if (this.value.length >= 2) {
        performRouteAddressSearch(this.value, "start");
      } else {
        document.getElementById("startSearchResults").style.display = "none";
      }
    }, 400);
  });

  //cautare destinatie
  endPointInput?.addEventListener("input", function () {
    clearTimeout(window.endSearchTimeout);
    window.endSearchTimeout = setTimeout(() => {
      if (this.value.length >= 2) {
        performRouteAddressSearch(this.value, "end");
      } else {
        document.getElementById("endSearchResults").style.display = "none";
      }
    }, 400);
  });

  //calculeaza ruta A*
  calculateRouteBtn?.addEventListener("click", function () {
    if (!startMarker || !endMarker) {
      showMessage("Selectează punct start și destinație");
      return;
    }

    //verifica daca sunt opriri intermediare
    if (intermediateStops.length > 0 && transportType.value === "driving") {
      calculateMultiStopRouteAStar();
    } else {
      calculateRouteAStar();
    }
  });

  //sterge ruta
  clearRouteBtn?.addEventListener("click", function () {
    clearRoute();
    if (startPointInput) startPointInput.value = "";
    if (endPointInput) endPointInput.value = "";
    clearIntermediateStops();
    hideAllRouteSearchResults();

    const coords = getUserCoords();
    if (isRoutePanelOpen && coords && startPointInput) {
      startPointInput.value = "Locația ta curentă";
      setStartPoint(coords[0], coords[1]);
    }
  });

  //ascunde rezultate la click in afara
  document.addEventListener("click", function (e) {
    const startResults = document.getElementById("startSearchResults");
    const endResults = document.getElementById("endSearchResults");

    if (
      startPointInput &&
      !startPointInput.contains(e.target) &&
      startResults
    ) {
      startResults.style.display = "none";
    }

    if (endPointInput && !endPointInput.contains(e.target) && endResults) {
      endResults.style.display = "none";
    }
  });
  const routePreference = document.getElementById("routePreference");
  const preferenceHint = document.getElementById("preferenceHint");
  const preferenceHintText = document.getElementById("preferenceHintText");

  //arata/ascunde selectorul de preferinta in funcție de transport
  if (transportType) {
    transportType.addEventListener("change", function () {
      if (routePreference && preferenceHint) {
        const isDriving = this.value === "driving";
        routePreference.style.display = isDriving ? "block" : "none";
        preferenceHint.style.display = isDriving ? "block" : "none";
      }
    });

    //seteaza starea initiala
    if (routePreference && preferenceHint) {
      const isDriving = transportType.value === "driving";
      routePreference.style.display = isDriving ? "block" : "none";
      preferenceHint.style.display = isDriving ? "block" : "none";
    }
  }

  //hint-uri scurte pentru fiecare preferinta
  const preferenceHints = {
    fastest: "Cea mai rapidă rută - prioritate timp",
    optimal: "Cea mai scurtă distanță",
    balanced: "Evită bulevarde aglomerate - mai puțin stres",
  };

  if (routePreference) {
    routePreference.addEventListener("change", function () {
      //actualizeaza hint-ul
      if (preferenceHintText) {
        preferenceHintText.textContent =
          preferenceHints[this.value] || preferenceHints.balanced;
      }

      //daca exista deja rute calculate, reaplica evidentierea
      if (academicRouteLayers.length > 0) {
        rehighlightRoutes(this.value);
      }
    });
  }
}

//cautare adrese pentru rutare
function performRouteAddressSearch(query, pointType) {
  const searchResults =
    pointType === "start"
      ? document.getElementById("startSearchResults")
      : document.getElementById("endSearchResults");

  fetch(
    `${API_PROXY}?action=geocode&query=${encodeURIComponent(query + ", Brașov")}`,
  )
    .then((res) => res.json())
    .then((data) => {
      const results = data.features;
      searchResults.innerHTML = "";

      if (results && results.length > 0) {
        let foundResults = false;
        const fragment = document.createDocumentFragment();

        results.forEach((place) => {
          const county = place.properties.county;
          if (county && county.toLowerCase().includes("brașov")) {
            foundResults = true;
            const li = document.createElement("li");
            li.className = "result-item";

            const displayName = place.properties.formatted;

            li.innerHTML = `
        <strong>${displayName.split(",")[0]}</strong>
        <div class="result-details">${displayName}</div>
      `;

            li.addEventListener("click", () => {
              selectRouteLocation(place, pointType);
              searchResults.style.display = "none";
            });

            fragment.appendChild(li);
          }
        });

        if (foundResults) {
          searchResults.appendChild(fragment);
          searchResults.style.display = "block";
        } else {
          const li = document.createElement("li");
          li.className = "result-item";
          li.innerHTML =
            '<div class="result-details">Nu s-au găsit rezultate în județul Brașov</div>';
          searchResults.appendChild(li);
          searchResults.style.display = "block";
        }
      }
    })
    .catch((err) => {
      console.error("Eroare la căutare rutare:", err);
      searchResults.innerHTML = "<li>Eroare la căutare</li>";
      searchResults.style.display = "block";
    });
}

function selectRouteLocation(place, pointType) {
  const lat = place.geometry.coordinates[1];
  const lon = place.geometry.coordinates[0];
  const locationName = place.properties.formatted;

  if (pointType === "start") {
    document.getElementById("startPoint").value = locationName;
    setStartPoint(lat, lon);
    const startResults = document.getElementById("startSearchResults");
    if (startResults) {
      startResults.style.display = "none";
    }
  } else {
    document.getElementById("endPoint").value = locationName;
    setEndPoint(lat, lon);
  }
  updateCalculateButton();
}

//setari puncte
export function setStartPoint(lat, lng) {
  if (startMarker) {
    getMap().removeLayer(startMarker);
  }
  startMarker = createMarker(lat, lng, "start");
  startMarker.bindPopup("<b>Punct start</b>").openPopup();
  updateCalculateButton();
}

export function setEndPoint(lat, lng) {
  if (endMarker) {
    getMap().removeLayer(endMarker);
  }
  endMarker = createMarker(lat, lng, "end");
  endMarker.bindPopup("<b>Punct destinație</b>").openPopup();
  updateCalculateButton();
}

export function getStartMarker() {
  return startMarker;
}
export function getEndMarker() {
  return endMarker;
}

//opriri intermediare
//1. creeaza un nou camp de input in container
//2. adauga event listener pentru cautare locatii
//3. la selectare creeaza un marker pentru oprire
//opririle sunt procesate in ordinea adaugarii, nu in functie de distanta
function addIntermediateStop() {
  const stopId = "stop_" + Date.now();
  const stopContainer = document.getElementById("intermediateStopsContainer");

  const stopDiv = document.createElement("div");
  stopDiv.className = "intermediate-stop";
  stopDiv.innerHTML = `
    <div class="stop-number">${intermediateStops.length + 1}</div>
    <input type="text" id="${stopId}" placeholder="Adaugă oprire" class="intermediate-stop-input" autocomplete="off">
    <button type="button" class="remove-stop-btn" data-stop-id="${stopId}">×</button>
    <div class="route-search-results intermediate-results" id="${stopId}_results"></div>
  `;

  stopContainer.appendChild(stopDiv);
  const stopInput = document.getElementById(stopId);
  let searchTimeout;

  stopInput.addEventListener("input", function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (this.value.length >= 2) {
        performIntermediateStopSearch(this.value, stopId);
      } else {
        const resultsDiv = document.getElementById(`${stopId}_results`);
        if (resultsDiv) resultsDiv.style.display = "none";
      }
    }, 400);
  });

  document.addEventListener("click", function (e) {
    const resultsDiv = document.getElementById(`${stopId}_results`);
    if (
      resultsDiv &&
      !stopInput.contains(e.target) &&
      !resultsDiv.contains(e.target)
    ) {
      resultsDiv.style.display = "none";
    }
  });

  stopDiv
    .querySelector(".remove-stop-btn")
    .addEventListener("click", function () {
      removeIntermediateStop(this.getAttribute("data-stop-id"));
    });

  intermediateStops.push({
    id: stopId,
    input: stopInput,
    marker: null,
    coords: null,
  });

  updateCalculateButton();
}

function removeIntermediateStop(stopId) {
  const stopIndex = intermediateStops.findIndex((stop) => stop.id === stopId);
  if (stopIndex !== -1) {
    if (intermediateStops[stopIndex].marker) {
      getMap().removeLayer(intermediateStops[stopIndex].marker);
    }
    intermediateStops.splice(stopIndex, 1);

    const stopElement = document
      .querySelector(`[data-stop-id="${stopId}"]`)
      ?.closest(".intermediate-stop");
    stopElement?.remove();

    renumberIntermediateStops();
    updateCalculateButton();
  }
}

function renumberIntermediateStops() {
  document
    .querySelectorAll(".stop-number")
    .forEach((el, i) => (el.textContent = i + 1));
}

function clearIntermediateStops() {
  intermediateStops.forEach((stop) => {
    if (stop.marker) getMap().removeLayer(stop.marker);
  });
  intermediateStops = [];
  document.getElementById("intermediateStopsContainer").innerHTML = "";
  updateCalculateButton();
}

function performIntermediateStopSearch(query, stopId) {
  const searchResults = document.getElementById(`${stopId}_results`);
  if (!searchResults) return;

  fetch(
    `${API_PROXY}?action=geocode&query=${encodeURIComponent(query + ", Brașov")}`,
  )
    .then((res) => res.json())
    .then((data) => {
      const results = data.features;
      searchResults.innerHTML = "";

      if (results && results.length > 0) {
        let foundResults = false;
        const fragment = document.createDocumentFragment();

        results.forEach((place) => {
          const county = place.properties.county;
          if (county && county.toLowerCase().includes("brașov")) {
            foundResults = true;
            const li = document.createElement("li");
            li.className = "result-item";

            const displayName = place.properties.formatted;

            li.innerHTML = `
              <strong>${displayName.split(",")[0]}</strong>
              <div class="result-details" style="font-size: 11px; color: #666;">${displayName}</div>
            `;

            li.addEventListener("click", () => {
              selectIntermediateStopLocation(place, stopId);
              searchResults.style.display = "none";
            });

            fragment.appendChild(li);
          }
        });

        if (foundResults) {
          searchResults.appendChild(fragment);
          searchResults.style.display = "block";
        } else {
          const li = document.createElement("li");
          li.innerHTML =
            '<div class="result-details">Nu s-au găsit rezultate în județul Brașov</div>';
          searchResults.appendChild(li);
          searchResults.style.display = "block";
        }
      } else {
        const li = document.createElement("li");
        li.innerHTML =
          '<div class="result-details">Niciun rezultat găsit</div>';
        searchResults.appendChild(li);
        searchResults.style.display = "block";
      }
    })
    .catch((err) => {
      console.error("Eroare la căutare oprire:", err);
      searchResults.innerHTML =
        '<li class="result-item"><div class="result-details">Eroare la căutare</div></li>';
      searchResults.style.display = "block";
    });
}

function selectIntermediateStopLocation(place, stopId) {
  const lat = place.geometry.coordinates[1];
  const lon = place.geometry.coordinates[0];
  const locationName = place.properties.formatted;

  const stopIndex = intermediateStops.findIndex((stop) => stop.id === stopId);
  if (stopIndex !== -1) {
    intermediateStops[stopIndex].input.value = locationName;
    intermediateStops[stopIndex].coords = { lat, lng: lon };

    if (intermediateStops[stopIndex].marker) {
      getMap().removeLayer(intermediateStops[stopIndex].marker);
    }

    intermediateStops[stopIndex].marker = createMarker(lat, lon, "intermediate")
      .bindPopup(`<b>Oprire ${stopIndex + 1}</b><br>${locationName}`)
      .openPopup();
  }
  updateCalculateButton();
}

//functia principala a*
//1. trimite coordonatele de start si end la backend, routing_graph_api.php
//2. backend-ul ruleaza A* pe graful rutier
//3. pentru masina - 3 rute
//4. pentru ealking/cycling o ruta
async function calculateRouteAStar() {
  if (!startMarker || !endMarker) {
    showMessage("Selectează punct start și destinație");
    return;
  }

  const startLatLng = startMarker.getLatLng();
  const endLatLng = endMarker.getLatLng();
  const transportType = document.getElementById("transportType").value;

  try {
    const response = await fetch("backend/routing_graph_api.php?action=route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: { lat: startLatLng.lat, lng: startLatLng.lng },
        end: { lat: endLatLng.lat, lng: endLatLng.lng },
        transport: transportType,
      }),
    });

    const data = await response.json();
    console.log(`Răspuns pentru ${transportType}:`, data);

    if (data.success) {
      //curata ruta veche
      clearRouteLayers();

      //afisam un mic indicator despre sursa rutei

      if (transportType === "driving" && data.routes) {
        displayCarRoutes(data);
      } else if (data.geojson) {
        displaySimpleRoute(data, transportType);
      }
    } else {
      showMessage(data.message || "Eroare la calcularea rutei", "error");
    }
  } catch (error) {
    console.error("❌ Eroare:", error);
    showMessage("Eroare de conexiune la server", "error");
  }
}

//rutare cu opriri multiple - A* secvential
//1. construieste array-ul de puncte start1 - stop1, start2 - stop2, etc
//2. calculeaza ruta intre fiecare pereche consecutiva
//combina toate segmentele intr-o singura ruta continua
async function calculateMultiStopRouteAStar() {
  if (!startMarker || !endMarker) {
    showMessage("Selectează punct start și destinație");
    return;
  }

  const incompleteStops = intermediateStops.filter((stop) => !stop.coords);
  if (incompleteStops.length > 0) {
    showMessage("Completează toate opririle intermediare", "error");
    return;
  }

  const transportType = document.getElementById("transportType").value;
  if (transportType !== "driving") {
    showMessage(
      "Opririle multiple sunt disponibile doar pentru mașină",
      "info",
    );
    return;
  }

  try {
    //construieste array-ul in ordine - start1 - stop1, start2 - stop2, etc
    const waypoints = [
      startMarker.getLatLng(),
      ...intermediateStops.map((stop) => ({
        lat: stop.coords.lat,
        lng: stop.coords.lng,
      })),
      endMarker.getLatLng(),
    ];

    let combinedGeoJSON = null;
    let totalDistance = 0;
    let allStats = [];

    //calculeaza ruta pe fiecare segment
    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];

      console.log(`Calculez segmentul ${i + 1}:`, from, "→", to);

      const response = await fetch(
        "backend/routing_graph_api.php?action=route",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: { lat: from.lat, lng: from.lng },
            end: { lat: to.lat, lng: to.lng },
            transport: "driving", //driving pentru opriri multiple
          }),
        },
      );

      const data = await response.json();

      if (!data.success || !data.routes) {
        throw new Error(`Nu s-a putut calcula segmentul ${i + 1}`);
      }

      //ia ruta optima (prima)
      const routeKey = Object.keys(data.routes)[0];
      const segmentRoute = data.routes[routeKey];

      if (!segmentRoute.geojson) continue;

      //combina GeoJSON-urile
      if (!combinedGeoJSON) {
        combinedGeoJSON = segmentRoute.geojson;
      } else {
        //concatenam coordonatele (eliminam primul punct al următorului segment ca sa nu avem duplicate)
        const coords1 = combinedGeoJSON.geometry.coordinates;
        const coords2 = segmentRoute.geojson.geometry.coordinates;

        //eliminam primul punct din coords2 care e acelasi cu ultimul din coords1
        if (coords2.length > 1) {
          combinedGeoJSON.geometry.coordinates = [
            ...coords1,
            ...coords2.slice(1),
          ];
        } else {
          combinedGeoJSON.geometry.coordinates = [...coords1, ...coords2];
        }
      }

      //aduna distanta si durata
      if (segmentRoute.properties.total_distance) {
        totalDistance += segmentRoute.properties.total_distance;
      }

      allStats.push(data.stats);
    }

    if (!combinedGeoJSON) {
      showMessage("Nu s-a putut calcula ruta", "error");
      return;
    }

    //curata rutele vechi
    clearRouteLayers();

    //deseneaza ruta combinata
    const routeLayer = L.geoJSON(combinedGeoJSON, {
      style: {
        color: "#4CAF50",
        weight: 6,
        opacity: 0.8,
      },
    }).addTo(getMap());

    //salveaza referinta
    routingControl = routeLayer;

    //afiseaza mesajul
    showMessage(`Ruta calculată: ${totalDistance.toFixed(2)} km`, "success");

    //track in istoric
    const startPointValue =
      document.getElementById("startPoint")?.value || "Start";
    const endPointValue =
      document.getElementById("endPoint")?.value || "Destinație";

    trackRoute(
      startPointValue,
      endPointValue,
      intermediateStops.length,
      "driving",
      totalDistance.toFixed(2),
      Math.round(totalDistance * 2), // aprox durata
    );

    //zoom la ruta
    getMap().fitBounds(routeLayer.getBounds());
  } catch (error) {
    console.error("Eroare la calculul rutei cu opriri:", error);
    showMessage("Eroare la calculul rutei cu opriri", "error");
  }
}

//afisarea rutelor la masina
//verde pentru ruta scurta, albastru pentru ruta rapida, portocaliu pentru ruta sigura
function displayCarRoutes(data) {
  clearRouteLayers();

  const colors = {
    optimal: "#4CAF50",
    fastest: "#2196F3",
    balanced: "#9C27B0",
  };

  const routeNames = {
    optimal: "Scurtă",
    fastest: "Rapidă",
    balanced: "Confort",
  };

  const preference =
    document.getElementById("routePreference")?.value || "fastest";

  const highlightWeight = 7;
  const dimmedWeight = 3;

  //desenează toate rutele
  Object.keys(data.routes).forEach((routeKey) => {
    const route = data.routes[routeKey];
    if (!route || !route.geojson) return;

    const isHighlighted = routeKey === preference;

    const layer = L.geoJSON(route.geojson, {
      style: {
        color: colors[routeKey],
        weight: isHighlighted ? highlightWeight : dimmedWeight,
        opacity: isHighlighted ? 0.95 : 0.75,
      },
    }).addTo(getMap());

    //adauga popup doar pentru ruta evidentiata
    if (isHighlighted) {
      const props = route.properties;
      let explanation = "";

      if (routeKey === "fastest") {
        explanation = `Cea mai rapidă: ${Math.round(props.total_time)} min<br>📏 Distanță: ${props.total_distance.toFixed(2)} km`;
      } else if (routeKey === "optimal") {
        explanation = `Cea mai scurtă: ${props.total_distance.toFixed(2)} km<br>⏱️ Timp: ${Math.round(props.total_time)} min`;
      } else if (routeKey === "balanced") {
        explanation = `Confort: ${props.total_distance.toFixed(2)} km, ${Math.round(props.total_time)} min<br>🛣️ Străzi liniștite`;
      }

      layer.bindPopup(`
        <div style="min-width: 200px;">
          <b style="color: ${colors[routeKey]};">${routeNames[routeKey]}</b><br>
          ${explanation}
        </div>
      `);
    }

    academicRouteLayers.push({
      key: routeKey,
      layer: layer,
    });
  });

  //actualizeaza hint-ul cu detalii specifice
  updatePreferenceHint(data, preference);

  zoomToAcademicRoutes();

  //track in istoric
  const selectedRoute = data.routes[preference];
  if (selectedRoute && selectedRoute.properties) {
    const startPointValue =
      document.getElementById("startPoint")?.value || "Start";
    const endPointValue =
      document.getElementById("endPoint")?.value || "Destinație";

    trackRoute(
      startPointValue,
      endPointValue,
      0,
      "driving",
      selectedRoute.properties.total_distance.toFixed(2),
      Math.round(selectedRoute.properties.total_time),
    );
  }
}
//functie noua pentru hint compact
function updatePreferenceHint(data, preference) {
  const hintElement = document.getElementById("preferenceHintText");
  if (!hintElement) return;

  const route = data.routes[preference];
  if (!route || !route.properties) return;

  const props = route.properties;

  if (preference === "fastest") {
    hintElement.textContent = `${Math.round(props.total_time)} min | ${props.total_distance.toFixed(1)} km`;
  } else if (preference === "optimal") {
    hintElement.textContent = `${props.total_distance.toFixed(1)} km | ~${Math.round(props.total_time)} min`;
  } else if (preference === "balanced") {
    hintElement.textContent = `${props.total_distance.toFixed(1)} km | ${Math.round(props.total_time)} min | străzi liniștite`;
  }
}

function rehighlightRoutes(preference) {
  const highlightWeight = 8;
  const dimmedWeight = 4;

  academicRouteLayers.forEach((item) => {
    const isHighlighted = item.key === preference;
    const layer = item.layer;

    layer.setStyle({
      weight: isHighlighted ? highlightWeight : dimmedWeight,
      opacity: isHighlighted ? 0.95 : 0.35,
    });
  });
}

//afisarea rutelor de mers pe jos/bicicleta
//verde deschis pentru mers pe jos, portocaliu pentru bicicleta
function displaySimpleRoute(data, transportType) {
  clearRouteLayers();

  const colors = {
    walking: "#50C878",
    cycling: "#FF6B35",
  };

  const icons = {
    walking: "🚶",
    cycling: "🚴",
  };

  const names = {
    walking: "Mers pe jos",
    cycling: "Bicicletă",
  };

  //deseneaza ruta
  routingControl = L.geoJSON(data.geojson, {
    style: {
      color: colors[transportType] || "#4A90E2",
      weight: 6,
      opacity: 0.8,
    },
  }).addTo(getMap());

  //afiseaza distanta
  const distance = data.total_cost?.toFixed(2) || "?";
  const speed = transportType === "walking" ? 5 : 15;
  const time = Math.round((parseFloat(distance) / speed) * 60);

  showMessage(
    `${names[transportType]}: ${distance} km, ${time} min`,
    "success",
  );

  //track in istoric
  const startPointValue =
    document.getElementById("startPoint")?.value || "Start";
  const endPointValue =
    document.getElementById("endPoint")?.value || "Destinație";

  trackRoute(startPointValue, endPointValue, 0, transportType, distance, time);

  //ajustează vederea
  if (routingControl && routingControl.getBounds) {
    getMap().fitBounds(routingControl.getBounds());
  }
}

//panou de informatii
//distanta si timpul estimat pentru fiecare ruta
//butoane pentru asuns/afisat fiecare ruta individual
//buton pentru afisat toate rutele
function showCarInfoPanel(data) {
  document.getElementById("academicInfoPanel")?.remove();

  const isMobile = window.innerWidth <= 768;

  const panel = document.createElement("div");
  panel.id = "academicInfoPanel";

  if (isMobile) {
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #e3e9e4;
      border-radius: 12px;
      padding: 10px;
      box-shadow: 0 5px 20px rgba(0,0,0,0.3);
      z-index: 2000;
      width: 90%;
      max-width: 350px;
      border: 2px solid #4e5044;
    `;
  } else {
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #e3e9e4;
      border-radius: 10px;
      padding: 15px;
      box-shadow: 0 5px 20px rgba(0,0,0,0.3);
      z-index: 2000;
      max-width: 90%;
      width: 500px;
      border: 2px solid #4e5044;
    `;
  }

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: ${isMobile ? "8px" : "12px"};">
      <h4 style="margin:0; color:#4e5044; font-size: ${isMobile ? "14px" : "16px"};">Rute disponibile</h4>
      <button onclick="this.parentElement.parentElement.remove()" 
              style="background:none; border:none; font-size:${isMobile ? "18px" : "20px"}; cursor:pointer;">×</button>
    </div>
  `;

  //helper pentru a obtine timpul
  function getTime(properties) {
    if (properties.total_time && properties.total_time !== "?") {
      return Math.round(properties.total_time);
    }
    //fallback: 30 km/h = 2 minute per km
    const dist = properties.total_distance || 0;
    return Math.round(dist * 2);
  }

  if (data.routes.optimal) {
    const dist =
      data.routes.optimal.properties.total_distance?.toFixed(2) || "?";
    const time = getTime(data.routes.optimal.properties);
    html += `
      <div style="border-left: 4px solid #4CAF50; padding: ${isMobile ? "6px 10px" : "8px 12px"}; background: rgba(0,0,0,0.05); border-radius: 4px; margin-bottom: 5px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: ${isMobile ? "12px" : "13px"}; font-weight: bold;">Scurtă</span>
          <div style="text-align: right;">
            <span style="font-size: 11px; color: #666;">${dist} km</span>
            <span style="font-size: 11px; color: #666; margin-left: 8px;"> ${time} min</span>
          </div>
        </div>
      </div>
    `;
  }

  if (data.routes.fastest) {
    const dist =
      data.routes.fastest.properties.total_distance?.toFixed(2) || "?";
    const time = getTime(data.routes.fastest.properties);
    html += `
      <div style="border-left: 4px solid #2196F3; padding: ${isMobile ? "6px 10px" : "8px 12px"}; background: rgba(0,0,0,0.05); border-radius: 4px; margin-bottom: 5px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: ${isMobile ? "12px" : "13px"}; font-weight: bold;">Rapidă</span>
          <div style="text-align: right;">
            <span style="font-size: 11px; color: #666;">${dist} km</span>
            <span style="font-size: 11px; color: #666; margin-left: 8px;"> ${time} min</span>
          </div>
        </div>
      </div>
    `;
  }

  if (data.routes.balanced) {
    const dist =
      data.routes.balanced.properties.total_distance?.toFixed(2) || "?";
    const time = getTime(data.routes.balanced.properties);
    html += `
      <div style="border-left: 4px solid #9C27B0; padding: ${isMobile ? "6px 10px" : "8px 12px"}; background: rgba(0,0,0,0.05); border-radius: 4px; margin-bottom: 5px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: ${isMobile ? "12px" : "13px"}; font-weight: bold;">Ponderată</span>
          <div style="text-align: right;">
            <span style="font-size: 11px; color: #666;">${dist} km</span>
            <span style="font-size: 11px; color: #666; margin-left: 8px;"> ${time} min</span>
          </div>
        </div>
      </div>
    `;
  }

  const btnSize = isMobile ? "4px" : "6px";
  const btnFont = isMobile ? "10px" : "12px";

  html += `
    <div style="display: flex; gap: 5px; margin-top: ${isMobile ? "8px" : "10px"};">
      <button id="hideOptimalBtn" style="flex:1; padding:${btnSize}; background:#4CAF50; color:white; border:none; border-radius:4px; cursor:pointer; font-size:${btnFont};">Ascunde scurtă</button>
      <button id="hideFastestBtn" style="flex:1; padding:${btnSize}; background:#2196F3; color:white; border:none; border-radius:4px; cursor:pointer; font-size:${btnFont};">Ascunde rapidă</button>
      <button id="hideBalancedBtn" style="flex:1; padding:${btnSize}; background:#9C27B0; color:white; border:none; border-radius:4px; cursor:pointer; font-size:${btnFont};">Ascunde ponderată</button>    </div>
    <div style="margin-top: ${isMobile ? "4px" : "5px"};">
      <button id="showAllBtn" style="width:100%; padding:${btnSize}; background:#4e5044; color:white; border:none; border-radius:4px; cursor:pointer; font-size:${btnFont};">Arată toate</button>
    </div>
  `;

  panel.innerHTML = html;
  document.body.appendChild(panel);

  document
    .getElementById("hideOptimalBtn")
    ?.addEventListener("click", () => toggleRouteVisibility("optimal", false));
  document
    .getElementById("hideFastestBtn")
    ?.addEventListener("click", () => toggleRouteVisibility("fastest", false));
  document
    .getElementById("hideBalancedBtn")
    ?.addEventListener("click", () => toggleRouteVisibility("balanced", false));
  document.getElementById("showAllBtn")?.addEventListener("click", () => {
    toggleRouteVisibility("optimal", true);
    toggleRouteVisibility("fastest", true);
    toggleRouteVisibility("balanced", true);
  });
}

//ascunde/arata rute
function toggleRouteVisibility(key, show) {
  academicRouteLayers.forEach((item) => {
    if (item.key === key) {
      if (show) {
        if (!getMap().hasLayer(item.layer)) {
          item.layer.addTo(getMap());
        }
      } else {
        getMap().removeLayer(item.layer);
      }
    }
  });
}

//zoom la toate rutele
function zoomToAcademicRoutes() {
  if (academicRouteLayers.length === 0) return;

  const bounds = L.latLngBounds();
  academicRouteLayers.forEach((item) => {
    if (item.layer && typeof item.layer.getBounds === "function") {
      try {
        bounds.extend(item.layer.getBounds());
      } catch (e) {
        //ignora layerele fara bounds valide
      }
    }
  });

  if (bounds.isValid()) {
    getMap().fitBounds(bounds, { padding: [50, 50] });
  }
}
//functii utilitare
function updateCalculateButton() {
  const btn = document.getElementById("calculateRouteBtn");
  const transportType = document.getElementById("transportType")?.value;

  if (!btn) return;

  if (transportType === "driving") {
    const allStopsValid = intermediateStops.every((s) => s.coords !== null);
    btn.disabled = !(startMarker && endMarker && allStopsValid);
  } else {
    btn.disabled = !(startMarker && endMarker);
  }
}

//sterge rutele simple/toate cele 3
function clearRouteLayers() {
  if (routingControl) {
    if (getMap().hasLayer(routingControl)) {
      getMap().removeLayer(routingControl);
    }
    routingControl = null;
  }

  academicRouteLayers.forEach((item) => {
    if (item.layer && getMap().hasLayer(item.layer)) {
      getMap().removeLayer(item.layer);
    }
  });
  academicRouteLayers = [];
}

function clearRoute() {
  clearRouteLayers();
  updateCalculateButton();
}

function hideAllRouteSearchResults() {
  const startResults = document.getElementById("startSearchResults");
  const endResults = document.getElementById("endSearchResults");

  if (startResults) startResults.style.display = "none";
  if (endResults) endResults.style.display = "none";
}
