//moduri harta si layer trafic live
import { getMap } from "../core/map.js";
import { API_PROXY } from "../config/constants.js";

let trafficLayer = null;

//initializeaza butoanele pentru modurile hartii si traficul live
export function initMapViewModes() {
  const toggleBtn = document.getElementById("mapViewToggleBtn");
  const popup = document.getElementById("mapViewPopup");

  if (!toggleBtn || !popup) return;

  const buttons = popup.querySelectorAll(".map-view-popup-btn");
  const trafficToggle = document.getElementById("trafficToggle");
  const trafficLegend = document.getElementById("trafficLegend");
  const map = getMap();

  //inchide popup la click in afara lui
  document.addEventListener("click", function (e) {
    if (!toggleBtn.contains(e.target) && !popup.contains(e.target)) {
      popup.classList.remove("show");
    }
  });

  //deschide/inchide popup
  toggleBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    popup.classList.toggle("show");
  });

  //butoanele pentru moduri harta
  buttons.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const mode = this.getAttribute("data-mode");
      buttons.forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      setMapViewMode(mode);

      //reincara traficul daca era activ
      if (trafficToggle && trafficToggle.checked && trafficLayer) {
        setTimeout(() => {
          if (trafficLayer && typeof trafficLayer.redraw === "function") {
            trafficLayer.redraw();
          }
        }, 200);
      }

      setTimeout(() => popup.classList.remove("show"), 500);
    });
  });

  //incarca preferinta salvata
  const savedMode = loadMapViewPreference();
  setMapViewMode(savedMode);
  buttons.forEach((btn) => {
    if (btn.getAttribute("data-mode") === savedMode) {
      btn.classList.add("active");
    }
  });

  //toggle trafic live
  if (trafficToggle) {
    trafficToggle.addEventListener("change", function () {
      if (this.checked) {
        showTrafficLayer();
        if (trafficLegend) trafficLegend.style.display = "block";
      } else {
        hideTrafficLayer();
        if (trafficLegend) trafficLegend.style.display = "none";
      }
    });
  }
}

//seteaza modul hartii - standard, satellite, relief
function setMapViewMode(mode) {
  const map = getMap();
  const mapContainer = map.getContainer();

  //elimină clasele vechi de mod
  mapContainer.className = mapContainer.className.replace(
    /\bmap-mode-\w+/g,
    "",
  );
  mapContainer.classList.add(`map-mode-${mode}`);

  if (mode !== "standard") {
    changeTileLayer(mode);
  } else {
    setDefaultTileLayer();
  }

  saveMapViewPreference(mode);
}

//Salvează toate layerele non-tile - markere, polilinii, layere non tile
function getNonTileLayers() {
  const map = getMap();
  const nonTileLayers = [];

  map.eachLayer((layer) => {
    if (!(layer instanceof L.TileLayer)) {
      nonTileLayers.push(layer);
    }
  });

  return nonTileLayers;
}

//elimina toate layerele de tip TileLayer de pe harta
function removeAllTileLayers() {
  const map = getMap();

  map.eachLayer((layer) => {
    if (layer instanceof L.TileLayer) {
      map.removeLayer(layer);
    }
  });
}

//adauga layerele non-tile inapoi pe harta (dacă nu există deja).
function restoreNonTileLayers(nonTileLayers) {
  const map = getMap();

  nonTileLayers.forEach((layer) => {
    if (!map.hasLayer(layer)) {
      layer.addTo(map);
    }
  });
}

//schimba stratul de baza al hartii
function changeTileLayer(mode) {
  const map = getMap();
  const nonTileLayers = getNonTileLayers();

  removeAllTileLayers();

  let tileLayer;
  switch (mode) {
    case "satellite":
      tileLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "© Esri" },
      );
      break;
    case "dark":
      tileLayer = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { attribution: "© OpenStreetMap, CartoDB" },
      );
      break;
    case "relief":
      tileLayer = L.tileLayer(
        "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        { attribution: "© OpenStreetMap, OpenTopoMap" },
      );
      break;
    default:
      setDefaultTileLayer();
      return;
  }

  tileLayer.addTo(map);
  restoreNonTileLayers(nonTileLayers);
}

//seteaza stratul implicit OSM
function setDefaultTileLayer() {
  const map = getMap();
  const nonTileLayers = getNonTileLayers();

  removeAllTileLayers();

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  restoreNonTileLayers(nonTileLayers);
}

//aalveaza preferinta utilizatorului pentru modul hartii.
function saveMapViewPreference(mode) {
  localStorage.setItem("preferredMapView", mode);
}

//incarca preferinta salvata a utilizatorului.
function loadMapViewPreference() {
  return localStorage.getItem("preferredMapView") || "standard";
}

//activeaza stratul de trafic live
let trafficZoomTimer;
let isTrafficVisible = false;

function showTrafficLayer() {
  const map = getMap();

  if (trafficLayer) {
    map.removeLayer(trafficLayer);
    trafficLayer = null;
  }

  trafficLayer = L.tileLayer(
    `${API_PROXY}?action=tomtom_traffic&z={z}&x={x}&y={y}`,
    {
      minZoom: 1,
      maxZoom: 18,
      tileSize: 256,
      opacity: 0,
      className: "traffic-layer-style",
      zIndex: 1001,
      updateWhenZooming: false,
      //preincarca tile-urile in fundal
      crossOrigin: true,
    },
  );

  trafficLayer.addTo(map);

  //eveniment la incarcarea primului tile
  trafficLayer.on("load", function () {
    if (!isTrafficVisible) {
      let opacity = 0;
      const fadeInterval = setInterval(() => {
        opacity += 0.1;
        if (opacity >= 0.8) {
          trafficLayer.setOpacity(0.8);
          clearInterval(fadeInterval);
        } else {
          trafficLayer.setOpacity(opacity);
        }
      }, 50);
      isTrafficVisible = true;
    }
  });

  //gestioneaza zoom-ul
  map.on("zoomstart", function () {
    if (trafficLayer && isTrafficVisible) {
      trafficLayer.setOpacity(0);
    }
  });

  map.on("zoomend", function () {
    if (trafficLayer && isTrafficVisible) {
      clearTimeout(trafficZoomTimer);
      trafficZoomTimer = setTimeout(() => {
        trafficLayer.redraw();
        let opacity = 0;
        const fadeInterval = setInterval(() => {
          opacity += 0.1;
          if (opacity >= 0.8) {
            trafficLayer.setOpacity(0.8);
            clearInterval(fadeInterval);
          } else {
            trafficLayer.setOpacity(opacity);
          }
        }, 50);
      }, 150);
    }
  });
}

//dezactiveaza stratul de trafic live.
function hideTrafficLayer() {
  if (trafficLayer) {
    getMap().removeLayer(trafficLayer);
    trafficLayer = null;
  }
}
