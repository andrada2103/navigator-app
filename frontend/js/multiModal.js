//sistem de rutare multimodala - mers pe jos+autobuz
//mersul pe jos este implementat folosind API-ul A*, trasportul public, autobuzul,
//foloseste datele GTFS
//1. utilzatorul introduce punctul de plecare si destinatie
//2. sistemul cauta statii de autobuz in apropiere - raza de 1km
//3. algoritm de cautare a rutelor: rute directe, rute cu schimb
//4. pentru fiecare ruta calculeaza timpi reali: mers pe jos pana la statie, timp de asteptare in statie,
//timp de calatorie cu autobuzul, mers pe jos de la statie pana la destinatie
//afiseaza rutele dupa timpul total
import { getMap, createMarker } from "../core/map.js";
import {
  showMessage,
  calculateDistance,
  formatDistance,
} from "../core/utils.js";
import { API_PROXY } from "../config/constants.js";
import { getUserCoords } from "./geolocation.js";

const WALKING_SPEED = 5;
const BUS_SPEED = 20;
const WAIT_TIME_DEFAULT = 5;
const TRANSFER_TIME = 2;
const STOP_DISTANCE_ESTIMATE = 0.5;

//starea curenta a sistemului
const state = {
  startCoords: null,
  startAddress: "",
  endCoords: null,
  endAddress: "",
  isPanelOpen: false,
};

//stocare markeri pe harta
const markers = {
  start: null,
  end: null,
  busStops: [],
};

//listarea rutelor pe harta
let routeLines = [];
//array cu rute curente (5)
let currentRoutes = [];

//cache pentru datele de transport  - evita cereri multiple la API pentru aceleasi rute
//stops - map cu statii, lines - map cu linii
const transitData = {
  stops: new Map(),
  lines: new Map(),
};
window.transitData = transitData;

//initializare sistem - apelata la pornirea aplicatiei
//1. construieste indexul de transport - statii si linii
//2. configureaza butoanele si panourile UI
//3. seteaza event listeners pentru cautare si navigare
//puncutl de plecare si destinatie se alege astfel:
//1. utilizatorul poate scrie manual intr-un camp de text
//2. sistemul cauta automat locatia folosind API-ul de geocoding
//3. rezultatele sunt filtrate sa fie doar in judetul brasov
//4. la selectare, coordonatele sunt salvate in state.startCoords/endCoords
export async function initMultiModal() {
  await buildTransitIndex();
  const busRouteBtn = document.getElementById("toggleBusRouteBtn");
  const busRoutePanel = document.getElementById("busRoutePanel");
  const routePanel = document.getElementById("routePanel");
  const toggleRoutePanelBtn = document.getElementById("toggleRoutePanelBtn");

  if (!busRouteBtn || !busRoutePanel) {
    console.warn("⚠️ Elementele pentru rutare multi-modală nu au fost găsite");
    return;
  }

  //toggle intre panoul de masina si autobuz
  busRouteBtn.addEventListener("click", () => {
    //daca panoul de autobuz este deja deschis - se inchide
    if (state.isPanelOpen) {
      //inchide panoul de autobuz
      state.isPanelOpen = false;
      busRoutePanel.style.display = "none";
      busRouteBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10z"/>
        </svg>
        <span>Autobuz</span>
      `;
      return;
    }

    //daca panoul de autobuz este inchis, il deschidem si inchidem panoul de masina
    if (routePanel && routePanel.style.display === "block") {
      routePanel.style.display = "none";
      if (toggleRoutePanelBtn) {
        toggleRoutePanelBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          <span>Rută</span>
        `;
      }
    }

    //deschide panoul de autobuz
    state.isPanelOpen = true;
    busRoutePanel.style.display = "block";
    busRouteBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="transform: scale(1.1);">
        <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10z"/>
      </svg>
      <span style="font-weight: bold;">Autobuz</span>
    `;

    //incarca liniile si parseaza inputul daca e cazul
    loadBusLines();
    const searchInput = document.getElementById("searchInput");
    if (searchInput && searchInput.value.includes("→")) {
      parseSearchInput(searchInput.value);
    }
  });

  //asculta evenimentul de deschidere a panoului de masina pentru a inchide panoul de autobuz
  if (toggleRoutePanelBtn) {
    toggleRoutePanelBtn.addEventListener("click", () => {
      //daca panoul de autobuz e deschis - se inchide
      if (state.isPanelOpen) {
        state.isPanelOpen = false;
        busRoutePanel.style.display = "none";
        busRouteBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10z"/>
          </svg>
          <span>Autobuz</span>
        `;
      }
    });
  }

  //initializeaza evenimentele
  setupEventListeners();

  //pentru input în cautarea principala
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter" && state.isPanelOpen) {
        e.preventDefault();
        parseSearchInput(searchInput.value);
        findRoutesWithTransfers();
      }
    });
  }
}

//event listeners
function setupEventListeners() {
  //butoane principale
  document
    .getElementById("findBusRoutesBtn")
    ?.addEventListener("click", findRoutesWithTransfers);
  document
    .getElementById("clearBusRouteBtn")
    ?.addEventListener("click", clearAll);
  document
    .getElementById("busStartLocationBtn")
    ?.addEventListener("click", useCurrentLocation);
  document
    .getElementById("busSwapLocationsBtn")
    ?.addEventListener("click", swapLocations);

  //cautare start
  const startInput = document.getElementById("busStartPoint");
  const endInput = document.getElementById("busEndPoint");

  if (startInput) {
    startInput.addEventListener(
      "input",
      debounce(() => {
        if (startInput.value.length >= 2) {
          searchLocation(startInput.value, "start");
        } else {
          hideSearchResults("start");
        }
      }, 400),
    );
  }

  if (endInput) {
    endInput.addEventListener(
      "input",
      debounce(() => {
        if (endInput.value.length >= 2) {
          searchLocation(endInput.value, "end");
        } else {
          hideSearchResults("end");
        }
      }, 400),
    );
  }

  //ascunde rezultate la click în afara
  document.addEventListener("click", (e) => {
    if (
      !e.target.closest("#busStartPoint") &&
      !e.target.closest("#busStartSearchResults")
    ) {
      hideSearchResults("start");
    }
    if (
      !e.target.closest("#busEndPoint") &&
      !e.target.closest("#busEndSearchResults")
    ) {
      hideSearchResults("end");
    }
  });
}

//functii utilitare
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function hideSearchResults(type) {
  const div = document.getElementById(
    `bus${type === "start" ? "Start" : "End"}SearchResults`,
  );
  if (div) div.style.display = "none";
}

//construieste indexul de transport pentru cautare rapida
//functionare:
//1. incarca toate liniile de autobuz din baza de date
//2. foloseste API-ul de batch pentru a obtine toate statiile pentru toate liniile - un singur request http
//3. populeaza 2 structuri de date: transitData.stops: Map cu stații și ce linii trec prin ele, transitData.lines: Map cu linii și stațiile lor pe fiecare direcție
//permite cautarea rutelor rapid - complexitate O(1) in loc de O(n)
//foloseste caching pentru a evita reincarcarea datelor
async function buildTransitIndex() {
  try {
    //incarca toate liniile
    const linesResponse = await fetch("bus_api.php?action=get_routes");
    const linesData = await linesResponse.json();
    if (!linesData.success) return;

    //ia toate route_ids
    const routeIds = linesData.routes.map((r) => r.route_id).join(",");

    //un singur request pentru toate liniile si directiile
    const batchResponse = await fetch(
      `bus_api.php?action=get_batch_stops&route_ids=${routeIds}&directions=0,1`,
    );
    const batchData = await batchResponse.json();

    if (!batchData.success) return;

    //proceseaza rezultatele
    transitData.stops.clear();
    transitData.lines.clear();

    for (const item of batchData.batch_results) {
      const route = linesData.routes.find((r) => r.route_id === item.route_id);
      if (!route) continue;

      //salveaza in lines
      if (!transitData.lines.has(item.route_id)) {
        transitData.lines.set(item.route_id, {
          route: route,
          directions: {},
        });
      }

      transitData.lines.get(item.route_id).directions[item.direction] = {
        stops: item.stops,
        stopIds: item.stops.map((s) => s.stop_id),
      };

      //salveaza in stops
      item.stops.forEach((stop) => {
        if (!transitData.stops.has(stop.stop_id)) {
          transitData.stops.set(stop.stop_id, {
            stop: stop,
            lines: [],
          });
        }

        transitData.stops.get(stop.stop_id).lines.push({
          route_id: item.route_id,
          direction: item.direction,
          route_short_name: route.route_short_name,
        });
      });
    }

    console.log("Index construit în batch:", {
      stops: transitData.stops.size,
      lines: transitData.lines.size,
    });
  } catch (error) {
    console.error("Eroare la construirea indexului:", error);
  }
}

//cauta rute optime intre punctele de plecare/destinatie
//1. gaseste toate statiile de autobuz in raza de 1km in jurul plecarii
//2. gaseste toate statiile de autobuz in raza de 1km in jurul destinatiei
//3. cauta rute directe
//4. cauta rute cu un schimb
//5. sorteaza toate rutele dupa timpul total si returneaza primele 5
//A* nu se foloseste pentru autobuze
//A* este folosit in backend pentru mersul pe jos pana la statie - distanta reala pe strazi, mersul pe jos de la statie la destinatie
async function findRoutesWithTransfers() {
  if (!state.startCoords || !state.endCoords) {
    showMessage("Selectează plecare și destinație", "error");
    return;
  }

  clearResults();

  //arata loading
  const container = document.getElementById("busRouteResults");
  if (container) {
    container.innerHTML =
      '<div style="text-align: center; padding: 20px;">Se caută rute cu autobuzul...</div>';
  }

  //permite UI sa se actualizeze
  await new Promise((resolve) => setTimeout(resolve, 10));

  try {
    //gaseste statiile accesibile pe jos
    const startStops = await findNearbyStops(state.startCoords, 1.0);
    const endStops = await findNearbyStops(state.endCoords, 1.0);

    console.log(`Stații lângă plecare: ${startStops.length}`);
    console.log(`Stații lângă destinație: ${endStops.length}`);

    if (startStops.length === 0) {
      showMessage(
        "Nu s-au găsit stații de autobuz în apropierea plecării",
        "error",
      );
      return;
    }

    if (endStops.length === 0) {
      showMessage(
        "Nu s-au găsit stații de autobuz în apropierea destinației",
        "error",
      );
      return;
    }

    let foundRoutes = [];

    //cauta rute directe
    const directRoutes = await findDirectRoutes(startStops, endStops);
    foundRoutes.push(...directRoutes);
    console.log(`Găsite ${directRoutes.length} rute directe`);

    //cauta rute cu un schimb
    const oneTransferRoutes = await findOneTransferRoutes(
      startStops,
      endStops,
      directRoutes,
    );
    foundRoutes.push(...oneTransferRoutes);
    console.log(`Găsite ${oneTransferRoutes.length} rute cu schimb`);

    //sorteaza dupa timpul total
    foundRoutes.sort((a, b) => a.totalTime - b.totalTime);

    if (foundRoutes.length > 0) {
      currentRoutes = foundRoutes.slice(0, 5);
      displayRoutes();
      showMessage(`Găsite ${currentRoutes.length} rute`, "success");
    } else {
      showMessage(
        "Nu s-a găsit nicio rută cu autobuzul. Încearcă o rază mai mare de căutare.",
        "info",
      );
    }
  } catch (error) {
    console.error("Eroare la căutarea rutelor:", error);
    showMessage(
      "A apărut o eroare la căutarea rutelor. Încearcă din nou.",
      "error",
    );
  }
}

//gasetse toate statiile de autobuz in raza specificata
//1. itereaza prin toate statiile din transitData.stops
//2. calculeaza distanta in linie dreapta intre coordonatele date si fiecare statie
//3. daca dist <= radiusKm - adauga statie in rezultate
//4. pentru fiecare statie calculeaza si timpul estimat de mers pe jos
//limitare cunoscuta: foloseste distanta in linie dreapta, nu distanta reala pe strazi
//de folosit api-ul A* pentru distante reale
async function findNearbyStops(coords, radiusKm = 0.5) {
  const nearby = [];

  for (const [stopId, data] of transitData.stops) {
    const dist = calculateDistance(
      coords.lat,
      coords.lng,
      data.stop.stop_lat,
      data.stop.stop_lon,
    );

    if (dist <= radiusKm) {
      nearby.push({
        stop: data.stop,
        stopId: stopId,
        distance: dist,
        lines: data.lines, //toate liniile
        walkTime: Math.round((dist / WALKING_SPEED) * 60),
        //adaugam un set de perechi (route_id, direction) pentru verificari rapide
        routeKeys: new Set(
          data.lines.map((l) => `${l.route_id}_${l.direction}`),
        ),
      });
    }
  }

  return nearby.sort((a, b) => a.distance - b.distance);
}

async function findDirectRoutes(startStops, endStops) {
  const routes = [];

  for (const startStop of startStops) {
    for (const endStop of endStops) {
      //gaseste liniile comune folosind doar indexul
      const commonLines = findCommonLines(startStop, endStop);

      //da nu exista linii comune, treci mai departe
      if (commonLines.length === 0) continue;

      for (const lineInfo of commonLines) {
        //folosim distanta din index daca e disponibila
        let busDistance = 0;
        const lineData = transitData.lines.get(lineInfo.route_id);
        if (
          lineData &&
          lineInfo.startStopIdx !== undefined &&
          lineInfo.endStopIdx !== undefined
        ) {
          //calculeaza distanta aproximativa pe baza numarului de statii
          const numStops = lineInfo.endStopIdx - lineInfo.startStopIdx;
          busDistance = numStops * STOP_DISTANCE_ESTIMATE; //aproximare 500m intre statii
        } else {
          //fallback: distanta în linie dreapta
          busDistance = calculateDistance(
            startStop.stop.stop_lat,
            startStop.stop.stop_lon,
            endStop.stop.stop_lat,
            endStop.stop.stop_lon,
          );
        }

        const busTime = Math.round((busDistance / BUS_SPEED) * 60);
        const waitTime = WAIT_TIME_DEFAULT;
        const walkToTime = startStop.walkTime;
        const walkFromTime = endStop.walkTime;
        const totalTime = walkToTime + waitTime + busTime + walkFromTime;

        routes.push({
          type: "direct",
          route: lineInfo.route,
          direction: lineInfo.direction,
          startStop: startStop.stop,
          endStop: endStop.stop,
          walkToDistance: startStop.distance,
          walkToTime: walkToTime,
          waitTime: waitTime,
          busDistance: busDistance,
          busTime: busTime,
          walkFromDistance: endStop.distance,
          walkFromTime: walkFromTime,
          totalTime: totalTime,
        });
      }
    }
  }

  return routes;
}

//cauta rute cu un singur schimb
//algoritmul folosets un graf de conexiuni
//1. construieste un map: stop_id -> Set(linii care trec prin statie)
//2. pentru fiecare combinatie statie_start - statie_destinatie:
//3. pentru fiecare linie care pleaca din statie_start:
//4. pentru fiecare statie de pe acea linie:
//5. verifica daca de la statia de transfer poti lua o linie catre destinatie
//6. calculeaza timpii pentru fiecare segment
//7. elimina duplicatele si sorteaza dupa timpul total
//optimizari: cache pentru timpii de asteptare (waitTimeCache), limita de combinatii (5000), eliminare duplicate folosing un Set cu chei unice
async function findOneTransferRoutes(startStops, endStops, directRoutes) {
  const routes = [];

  //mapeaza fiecare statie cu toate liniile care trec prin ea
  const stopToLines = new Map(); //stop_id -> Set(route_id_direction)

  for (const [stopId, data] of transitData.stops) {
    const lineKeys = new Set();
    for (const line of data.lines) {
      lineKeys.add(`${line.route_id}_${line.direction}`);
    }
    stopToLines.set(stopId, lineKeys);
  }

  //cache pentru waitTime
  const waitTimeCache = new Map();

  async function getCachedWaitTime(stopId, routeId, direction) {
    const cacheKey = `${stopId}_${routeId}_${direction}`;
    if (waitTimeCache.has(cacheKey)) {
      return waitTimeCache.get(cacheKey);
    }
    const waitTime = await estimateWaitTime(stopId, routeId, direction);
    waitTimeCache.set(cacheKey, waitTime);
    return waitTime;
  }

  //algoritm principal
  let processedCombinations = 0;
  const MAX_COMBINATIONS = 5000; //limita pentru a nu bloca browser-ul

  //pentru fiecare statie de start
  for (const startStop of startStops) {
    //pentru fiecare statie de destinatie
    for (const endStop of endStops) {
      if (endStop.stop.stop_id === startStop.stop.stop_id) continue;

      //obtine liniile disponibile la start si destinarie
      const startLinesSet =
        stopToLines.get(startStop.stop.stop_id) || new Set();
      const endLinesSet = stopToLines.get(endStop.stop.stop_id) || new Set();

      //cauta statii de transfer comune intre orice linie de start si orice linie de destinatie
      for (const startLineKey of startLinesSet) {
        //daca am procesat prea multe combinatii, ieșim
        if (processedCombinations > MAX_COMBINATIONS) {
          console.warn(
            `Limită atinsă: ${processedCombinations} combinații procesate`,
          );
          break;
        }

        const [route1_id, direction1] = startLineKey.split("_");
        const route1Data = transitData.lines.get(route1_id);
        if (!route1Data) continue;

        const route1 = route1Data.route;

        //obtine toate statiile de pe ruta 1 în directia corecta
        const stopsOnRoute1 = route1Data.directions[direction1]?.stops || [];

        //verifics dacs startStop e pe ruta 1
        const startIndex = stopsOnRoute1.findIndex(
          (s) => s.stop_id === startStop.stop.stop_id,
        );
        if (startIndex === -1) continue;

        //pentru fiecare statie de pe ruta 1 - potential transfer
        for (let i = startIndex + 1; i < stopsOnRoute1.length; i++) {
          const transferStop = stopsOnRoute1[i];

          //verifica daca de la statia de transfer poti lua o ruta catre destinatie
          const transferLinesSet =
            stopToLines.get(transferStop.stop_id) || new Set();

          //gaseste linii comune intre transfer si destinație
          for (const endLineKey of endLinesSet) {
            if (endLineKey === startLineKey) continue; //aceeasi ruta

            if (transferLinesSet.has(endLineKey)) {
              const [route2_id, direction2] = endLineKey.split("_");
              const route2Data = transitData.lines.get(route2_id);
              if (!route2Data) continue;

              const route2 = route2Data.route;

              //verifics ordinea pe ruta 2
              const stopsOnRoute2 =
                route2Data.directions[direction2]?.stops || [];
              const transferIndex2 = stopsOnRoute2.findIndex(
                (s) => s.stop_id === transferStop.stop_id,
              );
              const endIndex2 = stopsOnRoute2.findIndex(
                (s) => s.stop_id === endStop.stop.stop_id,
              );

              if (
                transferIndex2 === -1 ||
                endIndex2 === -1 ||
                transferIndex2 >= endIndex2
              ) {
                continue;
              }

              processedCombinations++;

              //calculeaza timpii
              const walkToTime = startStop.walkTime;
              const walkFromTime = endStop.walkTime;

              //distante pe baza numarului de statii
              const bus1Distance = (i - startIndex) * STOP_DISTANCE_ESTIMATE;
              const bus1Time = Math.round((bus1Distance / BUS_SPEED) * 60);

              const bus2Distance =
                (endIndex2 - transferIndex2) * STOP_DISTANCE_ESTIMATE;
              const bus2Time = Math.round((bus2Distance / BUS_SPEED) * 60);

              //timpi de asteptare
              const [wait1Time, wait2Time] = await Promise.all([
                getCachedWaitTime(
                  startStop.stop.stop_id,
                  route1_id,
                  direction1,
                ),
                getCachedWaitTime(transferStop.stop_id, route2_id, direction2),
              ]);

              const transferTime = TRANSFER_TIME;
              const totalTime =
                walkToTime +
                wait1Time +
                bus1Time +
                transferTime +
                wait2Time +
                bus2Time +
                walkFromTime;

              //adauga ruta
              routes.push({
                type: "transfer",
                route1: route1,
                route2: route2,
                direction1: parseInt(direction1),
                direction2: parseInt(direction2),
                startStop: startStop.stop,
                transferStop: transferStop,
                endStop: endStop.stop,
                walkToDistance: startStop.distance,
                walkToTime: walkToTime,
                wait1Time: wait1Time,
                bus1Distance: bus1Distance,
                bus1Time: bus1Time,
                transferTime: transferTime,
                wait2Time: wait2Time,
                bus2Distance: bus2Distance,
                bus2Time: bus2Time,
                walkFromDistance: endStop.distance,
                walkFromTime: walkFromTime,
                totalTime: totalTime,
              });

              //limita numarul de rute per combinatie
              if (routes.length > 50) break;
            }
          }
          if (routes.length > 50) break;
        }
        if (routes.length > 50) break;
      }
      if (routes.length > 50) break;
    }
    if (routes.length > 50) break;
  }

  //elimina duplicatele
  const uniqueRoutes = [];
  const routeKeys = new Set();

  for (const route of routes) {
    const key = `${route.route1.route_id}_${route.route2.route_id}_${route.startStop.stop_id}_${route.endStop.stop_id}`;
    if (!routeKeys.has(key)) {
      routeKeys.add(key);
      uniqueRoutes.push(route);
    }
  }

  //sorteaza dupa timp
  uniqueRoutes.sort((a, b) => a.totalTime - b.totalTime);

  if (uniqueRoutes.length > 0) {
    console.log("Primele 3 rute:");
    uniqueRoutes.slice(0, 3).forEach((r, i) => {
      console.log(
        `  ${i + 1}. ${r.route1.route_short_name} (${r.wait1Time}min aștept) → ${r.route2.route_short_name} (${r.wait2Time}min aștept) = ${r.totalTime}min`,
      );
    });
  }

  return uniqueRoutes.slice(0, 10);
}

function findCommonLines(stopA, stopB) {
  const common = [];

  for (const lineA of stopA.lines) {
    const key = `${lineA.route_id}_${lineA.direction}`;

    if (stopB.routeKeys.has(key)) {
      const lineData = transitData.lines.get(lineA.route_id);
      if (!lineData) continue;

      const directionStops =
        lineData.directions[lineA.direction]?.stopIds || [];
      const idxA = directionStops.indexOf(stopA.stop.stop_id);
      const idxB = directionStops.indexOf(stopB.stop.stop_id);

      if (idxA !== -1 && idxB !== -1 && idxB > idxA) {
        common.push({
          route_id: lineA.route_id,
          direction: lineA.direction,
          route: lineData.route,
          startStopIdx: idxA,
          endStopIdx: idxB,
        });
      }
    }
  }

  return common;
}

function findLinesBetweenStops(stopA, stopB) {
  const lines = [];

  for (const lineA of transitData.stops.get(stopA.stop_id)?.lines || []) {
    const lineData = transitData.lines.get(lineA.route_id);
    if (!lineData) continue;

    const directionStops = lineData.directions[lineA.direction]?.stopIds || [];
    const idxA = directionStops.indexOf(stopA.stop_id);
    const idxB = directionStops.indexOf(stopB.stop_id);

    if (idxA !== -1 && idxB !== -1 && idxB > idxA) {
      lines.push({
        route_id: lineA.route_id,
        direction: lineA.direction,
        route: lineData.route,
      });
    }
  }

  return lines;
}

//estimeaza timpul de asteptare pentru un autobuz intr-o statie
//1. face o cerere la api-ul bus_api - get_next_bus
//2. filtreaza sosirile pentru o ruta si directia specificata
//3. calculeaza diferenta in minute pana la primul autobuz
//4. daca nu sunt date live, returneaza valore implicita - 5 min
//foloseste date GTFS reale pentru orele de sosire
//ofera estimari realiste
//foloseste caching pentru a evita cereri repetate la aceeasi statie
async function estimateWaitTime(stopId, routeId, direction) {
  try {
    const response = await fetch(
      `bus_api.php?action=get_next_bus&stop_id=${encodeURIComponent(stopId)}`,
    );
    const data = await response.json();

    if (data.success && data.arrivals) {
      const now = new Date();
      const busesForRoute = data.arrivals
        .filter(
          (bus) =>
            bus.route_short_name == routeId && bus.direction_id == direction,
        )
        .map((bus) => {
          const [hours, minutes] = bus.arrival_time.split(":").map(Number);
          const busTime = new Date();
          busTime.setHours(hours, minutes, 0, 0);
          if (busTime < now) busTime.setDate(busTime.getDate() + 1);
          return busTime;
        })
        .sort((a, b) => a - b);

      if (busesForRoute.length > 0) {
        return Math.round((busesForRoute[0] - now) / (1000 * 60));
      }
    }
  } catch (e) {
    console.warn("Eroare estimare timp așteptare:", e);
  }

  return WAIT_TIME_DEFAULT; //fallback
}

//cautare locatii folosind api de geocoding
//1. utilizatorul selecteaza punctul de plecare/destinatie
//2. functia este apelata cu debounce (400ms) pentru a evita cereri multiple
//3. trimite query-ul + "Brașov" la api geocoding
//4. filtreaza rezultatele sa fie doar in jud bv
//5. afiseaza o lista dropdown cu rezultatele
//6. la selectare, se salveaza coordonatele si adresa in state
//7. adauga un marker pe harta la locatia selectata
async function searchLocation(query, type) {
  const resultsDiv = document.getElementById(
    `bus${type === "start" ? "Start" : "End"}SearchResults`,
  );
  if (!resultsDiv) return;

  try {
    const response = await fetch(
      `${API_PROXY}?action=geocode&query=${encodeURIComponent(query + ", Brașov")}`,
    );
    const data = await response.json();

    resultsDiv.innerHTML = "";

    if (data.features && data.features.length > 0) {
      const fragment = document.createDocumentFragment();

      data.features.forEach((place) => {
        //verifica daca e in Brasov
        const county = place.properties.county;
        if (county && county.toLowerCase().includes("brașov")) {
          const li = document.createElement("li");
          li.className = "result-item";

          const displayName = place.properties.formatted;

          li.innerHTML = `
            <strong>${displayName.split(",")[0]}</strong>
            <div class="result-details">${displayName}</div>
          `;

          li.addEventListener("click", () => {
            selectLocation(place, type);
            resultsDiv.style.display = "none";
          });

          fragment.appendChild(li);
        }
      });

      if (fragment.children.length > 0) {
        resultsDiv.appendChild(fragment);
        resultsDiv.style.display = "block";
      } else {
        const li = document.createElement("li");
        li.className = "result-item";
        li.innerHTML =
          '<div class="result-details">Nu s-au găsit rezultate în județul Brașov</div>';
        resultsDiv.appendChild(li);
        resultsDiv.style.display = "block";
      }
    } else {
      const li = document.createElement("li");
      li.className = "result-item";
      li.innerHTML =
        '<div class="result-details">Nu s-au găsit rezultate</div>';
      resultsDiv.appendChild(li);
      resultsDiv.style.display = "block";
    }
  } catch (error) {
    console.error("Eroare căutare:", error);
    const li = document.createElement("li");
    li.className = "result-item";
    li.innerHTML = '<div class="result-details">Eroare la căutare</div>';
    resultsDiv.appendChild(li);
    resultsDiv.style.display = "block";
  }
}

function selectLocation(place, type) {
  const lat = place.geometry.coordinates[1];
  const lng = place.geometry.coordinates[0];
  const address = place.properties.formatted;

  if (type === "start") {
    state.startCoords = { lat, lng };
    state.startAddress = address;
    document.getElementById("busStartPoint").value = address;
    updateMarker("start");
  } else {
    state.endCoords = { lat, lng };
    state.endAddress = address;
    document.getElementById("busEndPoint").value = address;
    updateMarker("end");
  }
}

function updateMarker(type) {
  const coords = type === "start" ? state.startCoords : state.endCoords;
  if (!coords) return;

  if (markers[type]) getMap().removeLayer(markers[type]);
  markers[type] = createMarker(
    coords.lat,
    coords.lng,
    type === "start" ? "start" : "end",
  );
  markers[type].bindPopup(
    `<b>${type === "start" ? "Plecare" : "Destinație"}</b><br>${
      type === "start" ? state.startAddress : state.endAddress
    }`,
  );
}

//functii utilizare panou
function useCurrentLocation() {
  const coords = getUserCoords();
  if (coords) {
    state.startCoords = { lat: coords[0], lng: coords[1] };
    document.getElementById("busStartPoint").value = "Locația mea";
    updateMarker("start");
    showMessage("Punct de plecare setat la locația ta");
  } else {
    showMessage("Locația ta nu este disponibilă", "error");
  }
}

function swapLocations() {
  [state.startCoords, state.endCoords] = [state.endCoords, state.startCoords];
  [state.startAddress, state.endAddress] = [
    state.endAddress,
    state.startAddress,
  ];

  document.getElementById("busStartPoint").value = state.startAddress || "";
  document.getElementById("busEndPoint").value = state.endAddress || "";

  updateMarker("start");
  updateMarker("end");
}

//parseaza inputul din cautarea principala
//utilizatorul poate scrie in casuta de cautare principala piata sfatului - gata
//functia detecteaza separatorii -> (sageata)
//separa textul in doua parti - plecare si destinatie
//completeaza automat campurile din panoul de autobuz
//cautare automata pentru ambele locatii
//nu merge :))), dar o las pesntru ca are trigger care forteaza cautarea locatiilor si salvarea coordonatelor in state
function parseSearchInput(input) {
  if (input.includes("→") || input.includes("->") || input.includes(">")) {
    const parts = input.split(/[→\->>]/).map((s) => s.trim());
    if (parts.length >= 2) {
      document.getElementById("busStartPoint").value = parts[0];
      document.getElementById("busEndPoint").value = parts[1];

      //cauta automat ambele locatii
      searchLocation(parts[0], "start");
      searchLocation(parts[1], "end");
    }
  }
}

//incarcare linii de autobuz cu cache
let busLinesCache = null;
let busLinesCacheTime = 0;
const CACHE_DURATION = 60000; //1 min

async function loadBusLines() {
  //verifica daca avem cache valid
  if (busLinesCache && Date.now() - busLinesCacheTime < CACHE_DURATION) {
    updateBusLinesSelect(busLinesCache);
    return;
  }

  try {
    const response = await fetch("bus_api.php?action=get_routes");
    const data = await response.json();

    if (data.success) {
      //salveaza în cache
      busLinesCache = data.routes;
      busLinesCacheTime = Date.now();

      updateBusLinesSelect(data.routes);
    }
  } catch (error) {
    console.error("Eroare la încărcarea liniilor:", error);
  }
}

function updateBusLinesSelect(routes) {
  const select = document.getElementById("busLineFilter");
  if (!select) return;

  select.innerHTML = '<option value="">Toate liniile</option>';
  routes.forEach((route) => {
    const option = document.createElement("option");
    option.value = route.route_id;
    option.textContent = `Linia ${route.route_short_name} - ${
      route.route_long_name || ""
    }`;
    select.appendChild(option);
  });
}

//afisare rute
function displayRoutes() {
  const container = document.getElementById("busRouteResults");
  if (!container) return;

  let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';

  currentRoutes.forEach((route, index) => {
    const isBest = index === 0;
    const borderColor = isBest ? "#4CAF50" : "#ddd";
    const bgColor = isBest ? "#f0fff0" : "white";

    if (route.type === "transfer") {
      //determinam culoarea pentru timpii de asteptare
      let wait1Color = "#666";
      if (route.wait1Time <= 2) wait1Color = "#4CAF50";
      else if (route.wait1Time <= 7) wait1Color = "#FF9800";
      else wait1Color = "#F44336";

      let wait2Color = "#666";
      if (route.wait2Time <= 2) wait2Color = "#4CAF50";
      else if (route.wait2Time <= 7) wait2Color = "#FF9800";
      else wait2Color = "#F44336";

      //ruta cu transfer - afisare speciala
      html += `
        <div class="bus-route-card" data-route-index="${index}" style="border: 2px solid ${borderColor}; border-radius: 8px; padding: 12px; background: ${bgColor}; cursor: pointer;">
          <div style="background: #FF9800; color: white; padding: 2px 8px; border-radius: 12px; display: inline-block; font-size: 11px; margin-bottom: 8px;">
            🔄 Cu schimb (${route.route1.route_short_name} → ${route.route2.route_short_name})
          </div>
          
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <div style="display: flex; gap: 5px;">
              <div style="background: #${route.route1.route_color || "4e5044"}; color: white; padding: 5px 12px; border-radius: 20px; font-weight: bold; font-size: 13px;">
                ${route.route1.route_short_name}
              </div>
              <div style="background: #${route.route2.route_color || "4e5044"}; color: white; padding: 5px 12px; border-radius: 20px; font-weight: bold; font-size: 13px;">
                ${route.route2.route_short_name}
              </div>
            </div>
            <div style="font-size: 13px; color: #666;">
              ⏱️ ${route.totalTime} min total
            </div>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 6px; margin: 10px 0; padding: 8px; background: rgba(0,0,0,0.02); border-radius: 6px;">
            <div style="display: flex; gap: 8px; font-size: 12px;">
              <span style="min-width: 30px;">🚶</span>
              <span><strong>${formatDistance(route.walkToDistance)}</strong> (${route.walkToTime} min) → <span style="font-weight: bold; color: #4e5044;">${route.startStop.stop_name}</span></span>
            </div>
            <div style="display: flex; gap: 8px; font-size: 12px;">
              <span style="min-width: 30px;">⏱️</span>
              <span style="color: ${wait1Color}; font-weight: bold;">Așteptare ${route.wait1Time} min</span>
            </div>
            <div style="display: flex; gap: 8px; font-size: 12px;">
              <span style="min-width: 30px;">🚌</span>
              <span><strong>${formatDistance(route.bus1Distance)}</strong> (${route.bus1Time} min) cu ${route.route1.route_short_name} → <span style="font-weight: bold; color: #4e5044;">${route.transferStop.stop_name}</span></span>
            </div>
            <div style="display: flex; gap: 8px; font-size: 12px; margin-left: 30px; color: #666;">
              <span>🔄 Schimb (${route.transferTime} min)</span>
            </div>
            <div style="display: flex; gap: 8px; font-size: 12px;">
              <span style="min-width: 30px;">⏱️</span>
              <span style="color: ${wait2Color}; font-weight: bold;">Așteptare ${route.wait2Time} min</span>
            </div>
            <div style="display: flex; gap: 8px; font-size: 12px;">
              <span style="min-width: 30px;">🚌</span>
              <span><strong>${formatDistance(route.bus2Distance)}</strong> (${route.bus2Time} min) cu ${route.route2.route_short_name} → <span style="font-weight: bold; color: #4e5044;">${route.endStop.stop_name}</span></span>
            </div>
            <div style="display: flex; gap: 8px; font-size: 12px;">
              <span style="min-width: 30px;">🚶</span>
              <span><strong>${formatDistance(route.walkFromDistance)}</strong> (${route.walkFromTime} min) → destinație</span>
            </div>
          </div>
          
          <div style="margin-top: 8px; font-size: 11px; color: #888; border-top: 1px dashed #ccc; padding-top: 6px;">
            ⏱️ Timp total: ${route.walkToTime} (mers) + ${route.wait1Time} (așteptare) + ${route.bus1Time} (autobuz) + ${route.transferTime} (schimb) + ${route.wait2Time} (așteptare) + ${route.bus2Time} (autobuz) + ${route.walkFromTime} (mers) = ${route.totalTime} min
          </div>
        </div>
      `;
    } else {
      //ruta directa - afisare existenta
      //determinam culoarea pentru timpul de asteptare
      let waitTimeColor = "#666";
      if (route.waitTime <= 2) waitTimeColor = "#4CAF50";
      else if (route.waitTime <= 7) waitTimeColor = "#FF9800";
      else waitTimeColor = "#F44336";

      html += `
        <div class="bus-route-card" data-route-index="${index}" style="border: 2px solid ${borderColor}; border-radius: 8px; padding: 12px; background: ${bgColor}; cursor: pointer;">
          ${
            isBest
              ? '<div style="background: #4CAF50; color: white; padding: 2px 8px; border-radius: 12px; display: inline-block; font-size: 11px; margin-bottom: 8px;">Cea mai rapidă (cu timp real)</div>'
              : ""
          }
          
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <div style="background: #${route.route.route_color || "4e5044"}; color: white; padding: 5px 12px; border-radius: 20px; font-weight: bold;">
              ${route.route.route_short_name}
            </div>
            <div style="font-size: 13px; color: #666;">
              ⏱️ ${route.totalTime} min total
            </div>
          </div>
          
          <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
            <div style="width: 24px; text-align: center;">🚶</div>
            <div style="flex: 1; font-size: 13px;">
              <strong>${formatDistance(route.walkToDistance)}</strong> (${route.walkToTime} min) până la 
              <span style="font-weight: bold; color: #4e5044;">${route.startStop.stop_name}</span>
            </div>
          </div>
          
          <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
            <div style="width: 24px; text-align: center;">⏱️</div>
            <div style="flex: 1; font-size: 13px;">
              <span style="color: ${waitTimeColor}; font-weight: bold;">Așteptare în stație: ${route.waitTime} min</span>
            </div>
          </div>
          
          <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
            <div style="width: 24px; text-align: center;">🚌</div>
            <div style="flex: 1; font-size: 13px;">
              <strong>${formatDistance(route.busDistance)}</strong> (${route.busTime} min) cu autobuzul
            </div>
          </div>
          
          <div style="display: flex; align-items: flex-start; gap: 8px;">
            <div style="width: 24px; text-align: center;">🚶</div>
            <div style="flex: 1; font-size: 13px;">
              <strong>${formatDistance(route.walkFromDistance)}</strong> (${route.walkFromTime} min) de la 
              <span style="font-weight: bold; color: #4e5044;">${route.endStop.stop_name}</span>
            </div>
          </div>
          
          <div style="margin-top: 8px; font-size: 11px; color: #888; border-top: 1px dashed #ccc; padding-top: 6px;">
            ⏱️ Timp total: ${route.walkToTime} (mers) + ${route.waitTime} (așteptare) + ${route.busTime} (autobuz) + ${route.walkFromTime} (mers) = ${route.totalTime} min
          </div>
        </div>
      `;
    }
  });

  html += "</div>";
  container.innerHTML = html;

  //event listeners pentru carduri
  document.querySelectorAll(".bus-route-card").forEach((card, index) => {
    card.addEventListener("click", () => {
      displayRouteOnMap(currentRoutes[index]);
    });
  });

  //afiseaza automat prima ruta pe harta
  if (currentRoutes.length > 0) {
    displayRouteOnMap(currentRoutes[0]);
  }
}

//afisare ruta pe harta cu A* pentru segmente pietonale
//1. pentru segmentul pietonal plecare - statie: foloseste A* pentru a gasi drumul real pe strazi, deseneaza cu verde punctat
//2. pentru segmentul cu autobuzul - incarca forma geometrica a traseului
//extrage doar portiunea dintre statia de urcare si cea de coborare, deseneaza cu culoarea specifica rutei
//3. daca ruta e cu transfer - deseneaza 2 segmente de autobuz, adauga un marker pentru statia de schimb
//4. pentru segmentul pietonal statie - destinatie: foloseste A* + linie verde punctata
async function displayRouteOnMap(routeData) {
  clearRouteLines();

  const map = getMap();
  const start = state.startCoords;
  const end = state.endCoords;

  showMessage("Se încarcă ruta pe hartă...", "info");

  //validare date
  console.log("Date rută pentru afișare:", {
    tip: routeData.type || "directă",
    startCoords: start,
    endCoords: end,
    startStop: routeData.startStop?.stop_name,
    endStop: routeData.endStop?.stop_name,
  });

  //marcheaza cardul activ
  document.querySelectorAll(".bus-route-card").forEach((card) => {
    card.removeAttribute("data-active");
    card.style.borderColor = "#ddd";
    card.style.background = "white";
  });

  const activeCard = document.querySelector(
    `.bus-route-card[data-route-index="${currentRoutes.indexOf(routeData)}"]`,
  );
  if (activeCard) {
    activeCard.setAttribute("data-active", "true");
    activeCard.style.borderColor = "#4CAF50";
    activeCard.style.background = "#f0fff0";
  }

  //facem o copie a routeData ca sa nu modificam originalul direct
  const updatedRouteData = { ...routeData };

  try {
    //mers pe jos pana la statie - A*
    const walk1 = await getWalkingRouteAStar(
      { lat: start.lat, lng: start.lng },
      { lat: routeData.startStop.stop_lat, lng: routeData.startStop.stop_lon },
    );

    if (walk1 && walk1.geojson) {
      L.geoJSON(walk1.geojson, {
        style: {
          color: "#50C878",
          weight: 4,
          opacity: 0.8,
          dashArray: "5, 8",
        },
      }).addTo(map);

      if (walk1.distance) {
        const actualWalkToTime = Math.round(
          (walk1.distance / WALKING_SPEED) * 60,
        );
        updatedRouteData.walkToTime = actualWalkToTime;
        updatedRouteData.walkToDistance = walk1.distance;
        console.log(
          `Mers real până la stație: ${walk1.distance.toFixed(3)} km (${actualWalkToTime} min)`,
        );
      }
    }

    //verifica tipul rutei si deseneaza corespunzator
    if (routeData.type === "transfer") {
      //primul autobuz
      const busPoints1 = await getBusRouteShape(
        routeData.route1.route_id,
        routeData.direction1,
      );

      if (busPoints1 && busPoints1.length > 0) {
        console.log(`Primul autobuz: ${busPoints1.length} puncte în traseu`);

        // gaseste indexurile pentru statii
        const startIdx1 = findClosestPointIndex(
          busPoints1,
          routeData.startStop,
        );
        const endIdx1 = findClosestPointIndex(
          busPoints1,
          routeData.transferStop,
        );

        console.log(`Indexuri: start=${startIdx1}, transfer=${endIdx1}`);

        let busLinePoints1 = busPoints1;

        //daca am gasit ambele statii si sunt in ordinea corecta
        if (startIdx1 !== -1 && endIdx1 !== -1) {
          if (startIdx1 < endIdx1) {
            busLinePoints1 = busPoints1.slice(startIdx1, endIdx1 + 1);
            console.log(
              `Segment extras: ${busLinePoints1.length} puncte de la ${startIdx1} la ${endIdx1}`,
            );
          } else {
            console.warn(`Stații în ordine inversă pentru primul autobuz`);
            //incearca cu directia opusa
            const oppositeDirection = routeData.direction1 === 0 ? 1 : 0;
            const oppositeBusPoints = await getBusRouteShape(
              routeData.route1.route_id,
              oppositeDirection,
            );

            if (oppositeBusPoints) {
              const newStartIdx = findClosestPointIndex(
                oppositeBusPoints,
                routeData.startStop,
              );
              const newEndIdx = findClosestPointIndex(
                oppositeBusPoints,
                routeData.transferStop,
              );

              if (
                newStartIdx !== -1 &&
                newEndIdx !== -1 &&
                newStartIdx < newEndIdx
              ) {
                busLinePoints1 = oppositeBusPoints.slice(
                  newStartIdx,
                  newEndIdx + 1,
                );
                console.log(
                  `Folosesc direcția opusă: ${busLinePoints1.length} puncte`,
                );
              }
            }
          }
        } else {
          console.warn(
            `Nu s-au găsit puncte apropiate pentru primul autobuz:`,
            {
              startIdx: startIdx1,
              endIdx: endIdx1,
            },
          );
        }

        //deseneaza primul autobuz
        const busLine1 = L.polyline(busLinePoints1, {
          color: "#" + (routeData.route1.route_color || "4e5044"),
          weight: 6,
          opacity: 0.9,
        }).addTo(map);
        routeLines.push(busLine1);
      }

      //al doilea autobuz
      const busPoints2 = await getBusRouteShape(
        routeData.route2.route_id,
        routeData.direction2,
      );

      if (busPoints2 && busPoints2.length > 0) {
        console.log(`Al doilea autobuz: ${busPoints2.length} puncte în traseu`);

        //gasește indexurile pentru statii
        const startIdx2 = findClosestPointIndex(
          busPoints2,
          routeData.transferStop,
        );
        const endIdx2 = findClosestPointIndex(busPoints2, routeData.endStop);

        console.log(`Indexuri: transfer=${startIdx2}, end=${endIdx2}`);

        let busLinePoints2 = busPoints2;

        //daca am gasit ambele statii si sunt in ordinea corecta
        if (startIdx2 !== -1 && endIdx2 !== -1) {
          if (startIdx2 < endIdx2) {
            busLinePoints2 = busPoints2.slice(startIdx2, endIdx2 + 1);
            console.log(
              `Segment extras: ${busLinePoints2.length} puncte de la ${startIdx2} la ${endIdx2}`,
            );
          } else {
            console.warn(`Stații în ordine inversă pentru al doilea autobuz`);
            //incearca cu directia opusa
            const oppositeDirection = routeData.direction2 === 0 ? 1 : 0;
            const oppositeBusPoints = await getBusRouteShape(
              routeData.route2.route_id,
              oppositeDirection,
            );

            if (oppositeBusPoints) {
              const newStartIdx = findClosestPointIndex(
                oppositeBusPoints,
                routeData.transferStop,
              );
              const newEndIdx = findClosestPointIndex(
                oppositeBusPoints,
                routeData.endStop,
              );

              if (
                newStartIdx !== -1 &&
                newEndIdx !== -1 &&
                newStartIdx < newEndIdx
              ) {
                busLinePoints2 = oppositeBusPoints.slice(
                  newStartIdx,
                  newEndIdx + 1,
                );
                console.log(
                  `Folosesc direcția opusă: ${busLinePoints2.length} puncte`,
                );
              }
            }
          }
        } else {
          console.warn(
            `Nu s-au găsit puncte apropiate pentru al doilea autobuz:`,
            {
              startIdx: startIdx2,
              endIdx: endIdx2,
            },
          );
        }

        //deseneaza al doilea autobuz
        const busLine2 = L.polyline(busLinePoints2, {
          color: "#" + (routeData.route2.route_color || "4e5044"),
          weight: 6,
          opacity: 0.9,
        }).addTo(map);
        routeLines.push(busLine2);
      }

      //marker pentru statia de transfer
      const transferStopMarker = createMarker(
        routeData.transferStop.stop_lat,
        routeData.transferStop.stop_lon,
        "intermediate",
      );
      transferStopMarker.bindPopup(
        `<b>Schimb</b><br>${routeData.transferStop.stop_name}<br>${routeData.route1.route_short_name} → ${routeData.route2.route_short_name}`,
      );
      markers.busStops.push(transferStopMarker);
    } else {
      //ruta directa

      const busPoints = await getBusRouteShape(
        routeData.route.route_id,
        routeData.direction,
      );

      if (busPoints && busPoints.length > 0) {
        console.log(`Traseu: ${busPoints.length} puncte`);

        const startIdx = findClosestPointIndex(busPoints, routeData.startStop);
        const endIdx = findClosestPointIndex(busPoints, routeData.endStop);

        console.log(`Indexuri: start=${startIdx}, end=${endIdx}`);

        let busLinePoints = busPoints;

        if (startIdx !== -1 && endIdx !== -1) {
          if (startIdx < endIdx) {
            busLinePoints = busPoints.slice(startIdx, endIdx + 1);
            console.log(
              `Segment extras: ${busLinePoints.length} puncte de la ${startIdx} la ${endIdx}`,
            );
          } else {
            console.warn(`Stații în ordine inversă pentru rută directă`);
            //incearca cu directia opusa
            const oppositeDirection = routeData.direction === 0 ? 1 : 0;
            const oppositeBusPoints = await getBusRouteShape(
              routeData.route.route_id,
              oppositeDirection,
            );

            if (oppositeBusPoints) {
              const newStartIdx = findClosestPointIndex(
                oppositeBusPoints,
                routeData.startStop,
              );
              const newEndIdx = findClosestPointIndex(
                oppositeBusPoints,
                routeData.endStop,
              );

              if (
                newStartIdx !== -1 &&
                newEndIdx !== -1 &&
                newStartIdx < newEndIdx
              ) {
                busLinePoints = oppositeBusPoints.slice(
                  newStartIdx,
                  newEndIdx + 1,
                );
                console.log(
                  `Folosesc direcția opusă: ${busLinePoints.length} puncte`,
                );
              }
            }
          }
        } else {
          console.warn(`Nu s-au găsit puncte apropiate pentru stații:`, {
            startIdx,
            endIdx,
          });
        }

        //deseneaza autobuzul
        const busLine = L.polyline(busLinePoints, {
          color: "#" + (routeData.route.route_color || "4e5044"),
          weight: 6,
          opacity: 0.9,
        }).addTo(map);
        routeLines.push(busLine);
      }
    }

    //mers pe jos de la statie la destinatie - A*
    const walk2 = await getWalkingRouteAStar(
      { lat: routeData.endStop.stop_lat, lng: routeData.endStop.stop_lon },
      { lat: end.lat, lng: end.lng },
    );

    if (walk2 && walk2.geojson) {
      L.geoJSON(walk2.geojson, {
        style: {
          color: "#50C878",
          weight: 4,
          opacity: 0.8,
          dashArray: "5, 8",
        },
      }).addTo(map);

      if (walk2.distance) {
        const actualWalkFromTime = Math.round(
          (walk2.distance / WALKING_SPEED) * 60,
        );
        updatedRouteData.walkFromTime = actualWalkFromTime;
        updatedRouteData.walkFromDistance = walk2.distance;
        console.log(
          `Mers real de la stație: ${walk2.distance.toFixed(3)} km (${actualWalkFromTime} min)`,
        );
      }
    }

    //recalculeaza timpul total
    if (routeData.type === "transfer") {
      updatedRouteData.totalTime =
        updatedRouteData.walkToTime +
        updatedRouteData.wait1Time +
        updatedRouteData.bus1Time +
        updatedRouteData.transferTime +
        updatedRouteData.wait2Time +
        updatedRouteData.bus2Time +
        updatedRouteData.walkFromTime;
    } else {
      updatedRouteData.totalTime =
        updatedRouteData.walkToTime +
        updatedRouteData.waitTime +
        updatedRouteData.busTime +
        updatedRouteData.walkFromTime;
    }

    //markere pentru statii
    if (markers.busStops.length) {
      markers.busStops.forEach((m) => map.removeLayer(m));
    }
    markers.busStops = [];

    //marker pentru statia de imbarcare
    const startStopMarker = createMarker(
      routeData.startStop.stop_lat,
      routeData.startStop.stop_lon,
      "intermediate",
    );

    let startPopupText = `<b>Îmbarcare</b><br>${routeData.startStop.stop_name}<br>`;
    if (routeData.type === "transfer") {
      startPopupText += `Linia ${routeData.route1.route_short_name}`;
    } else {
      startPopupText += `Linia ${routeData.route.route_short_name}`;
    }
    startStopMarker.bindPopup(startPopupText);
    markers.busStops.push(startStopMarker);

    //marker pentru statia de debarcare
    const endStopMarker = createMarker(
      routeData.endStop.stop_lat,
      routeData.endStop.stop_lon,
      "intermediate",
    );

    let endPopupText = `<b>Debarcare</b><br>${routeData.endStop.stop_name}<br>`;
    if (routeData.type === "transfer") {
      endPopupText += `Linia ${routeData.route2.route_short_name}`;
    } else {
      endPopupText += `Linia ${routeData.route.route_short_name}`;
    }
    endStopMarker.bindPopup(endPopupText);
    markers.busStops.push(endStopMarker);

    //zoom la intregul traseu
    try {
      const bounds = L.latLngBounds([
        [start.lat, start.lng],
        [routeData.startStop.stop_lat, routeData.startStop.stop_lon],
        [routeData.endStop.stop_lat, routeData.endStop.stop_lon],
        [end.lat, end.lng],
      ]);

      if (routeData.type === "transfer") {
        bounds.extend([
          routeData.transferStop.stop_lat,
          routeData.transferStop.stop_lon,
        ]);
      }

      map.fitBounds(bounds, { padding: [50, 50] });
    } catch (e) {
      console.warn("Nu s-a putut face fitBounds");
    }

    //actualizeaza afisajul in panou
    updateRouteDisplay(updatedRouteData, currentRoutes.indexOf(routeData));

    showMessage("Rută încărcată cu succes", "success");
  } catch (error) {
    console.error("Eroare la afișarea rutei:", error);
    showMessage("Eroare la încărcarea rutei", "error");
  }

  //track bus pentru debugging
  if (typeof trackBus === "function") {
    trackBus(
      routeData.type === "transfer"
        ? `${routeData.route1.route_short_name}→${routeData.route2.route_short_name}`
        : routeData.route.route_short_name,
      routeData.startStop.stop_name,
      routeData.direction || routeData.direction1,
      routeData.totalTime,
    );
  }
}
//functie ajutatoare pentru a actualiza afisajul pentru un anumit card
function updateRouteDisplay(routeData, cardIndex) {
  const cards = document.querySelectorAll(".bus-route-card");

  if (cards.length > cardIndex) {
    const targetCard = cards[cardIndex];

    // Actualizează timpul total
    const timeElement = targetCard.querySelector(
      'div[style*="font-size: 13px; color: #666;"]',
    );
    if (timeElement) {
      timeElement.innerHTML = `⏱️ ${routeData.totalTime} min total`;
    }

    // 🔥 VERIFICĂ TIPUL RUTEI
    if (routeData.type === "transfer") {
      // Pentru rute cu transfer, actualizează doar timpul total,
      // pentru că detaliile sunt deja corecte în cardul original
      // (cardul nu se modifică după afișare)
      return;
    }

    // Restul codului doar pentru rute directe
    const rows = targetCard.querySelectorAll(
      'div[style*="display: flex; align-items: flex-start; gap: 8px;"]',
    );

    if (rows.length >= 4) {
      const walkToText = rows[0].querySelector('div[style*="flex: 1"]');
      if (walkToText) {
        const strongElement = walkToText.querySelector("strong");
        if (strongElement) {
          strongElement.innerHTML = formatDistance(routeData.walkToDistance);
          const textNode = strongElement.nextSibling;
          if (textNode) {
            textNode.textContent = ` (${routeData.walkToTime} min) până la `;
          }
        }
      }

      const walkFromText = rows[3].querySelector('div[style*="flex: 1"]');
      if (walkFromText) {
        const strongElement = walkFromText.querySelector("strong");
        if (strongElement) {
          strongElement.innerHTML = formatDistance(routeData.walkFromDistance);
          const textNode = strongElement.nextSibling;
          if (textNode) {
            textNode.textContent = ` (${routeData.walkFromTime} min) de la `;
          }
        }
      }
    }

    const detailElement = targetCard.querySelector(
      'div[style*="margin-top: 8px; font-size: 11px; color: #888;"]',
    );
    if (detailElement) {
      detailElement.innerHTML = `
        ⏱️ Timp total: ${routeData.walkToTime} (mers) + ${routeData.waitTime} (așteptare) + ${routeData.busTime} (autobuz) + ${routeData.walkFromTime} (mers) = ${routeData.totalTime} min
      `;
    }
  }
}

//obtine traseul pietonal intre 2 puncte folosind A*
//1. trimite coordonatele de start si destinatie la backend (routing_graph_api.php)
//2. backend-ul ruleaza algoritmul A* pe graful rutier
//3. returneaza geojson-ul traseului si distanta reala
//fallback: daca api-ul esueaza, foloseste linie dreapta intre puncte - distanta estimata va fi mai mica
async function getWalkingRouteAStar(from, to) {
  try {
    const response = await fetch("backend/routing_graph_api.php?action=route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: { lat: from.lat, lng: from.lng },
        end: { lat: to.lat, lng: to.lng },
        transport: "walking",
      }),
    });

    const data = await response.json();
    console.log("Răspuns A* walking:", data);

    if (data.success && data.geojson) {
      let realDistance = 0;

      if (data.total_distance) {
        realDistance = data.total_distance;
      } else if (data.total_cost) {
        realDistance = data.total_cost;
      }

      console.log(`Distanță reală calculată: ${realDistance.toFixed(3)} km`);

      return {
        geojson: data.geojson,
        distance: realDistance,
      };
    } else {
      //fallback: linie dreapta
      const directDistance = calculateDistance(
        from.lat,
        from.lng,
        to.lat,
        to.lng,
      );
      console.log(`Fallback la linie dreaptă: ${directDistance.toFixed(3)} km`);

      return {
        geojson: {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [from.lng, from.lat],
              [to.lng, to.lat],
            ],
          },
        },
        distance: directDistance,
      };
    }
  } catch (error) {
    console.error("Eroare walking route A*:", error);
    const directDistance = calculateDistance(
      from.lat,
      from.lng,
      to.lat,
      to.lng,
    );
    return {
      geojson: {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
        },
      },
      distance: directDistance,
    };
  }
}

async function getBusRouteShape(routeId, direction) {
  try {
    const response = await fetch(
      `bus_api.php?action=get_route_shape&route_id=${routeId}&direction=${direction}`,
    );
    const data = await response.json();
    if (data.success && data.points) {
      return data.points.map((p) => [
        parseFloat(p.shape_pt_lat),
        parseFloat(p.shape_pt_lon),
      ]);
    }
  } catch (error) {
    console.error("Eroare bus shape:", error);
  }
  return null;
}

function findClosestPointIndex(points, stop, maxDistanceKm = 0.2) {
  let minDist = Infinity;
  let minIdx = -1;

  points.forEach((point, idx) => {
    const dist = calculateDistance(
      point[0], // lat
      point[1], // lng
      stop.stop_lat,
      stop.stop_lon,
    );

    if (dist < minDist && dist <= maxDistanceKm) {
      minDist = dist;
      minIdx = idx;
    }
  });

  console.log(
    `Stație ${stop.stop_name}: ${minIdx !== -1 ? `index ${minIdx} la ${(minDist * 1000).toFixed(0)}m` : "❌ NICIUN PUNCT APROPIAT"}`,
  );

  return minIdx;
}

function clearRouteLines() {
  //sterge doar layerele de autobuz
  routeLines.forEach((line) => {
    if (line) getMap().removeLayer(line);
  });
  routeLines = [];

  //sterge doar layerele care NU sunt conturul Brașovului
  getMap().eachLayer((layer) => {
    //verifica daca e un layer de rută (geojson sau polyline)
    if (layer instanceof L.GeoJSON || layer instanceof L.Polyline) {
      //verifica daca are clasa speciala pentru contur
      const hasBrasovClass =
        layer.options && layer.options.className === "brasov-boundary-layer";

      //daca NU e contur - sters
      if (!hasBrasovClass) {
        getMap().removeLayer(layer);
      }
    }
  });
}

function clearMarkers() {
  if (markers.start) getMap().removeLayer(markers.start);
  if (markers.end) getMap().removeLayer(markers.end);
  markers.busStops.forEach((m) => {
    if (m) getMap().removeLayer(m);
  });
  markers.start = null;
  markers.end = null;
  markers.busStops = [];
}

function clearResults() {
  clearRouteLines();
  clearMarkers();
  document.getElementById("busRouteResults").innerHTML = "";
  currentRoutes = [];
}

function clearAll() {
  state.startCoords = null;
  state.endCoords = null;
  state.startAddress = "";
  state.endAddress = "";

  document.getElementById("busStartPoint").value = "";
  document.getElementById("busEndPoint").value = "";

  clearResults();
  hideSearchResults("start");
  hideSearchResults("end");
}

export default {
  init: initMultiModal,
  findRoutesWithTransfers,
  clearAll,
};
