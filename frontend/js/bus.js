//sistem autobuze
import { getMap } from "../core/map.js";
import { showMessage } from "../core/utils.js";
import { trackBus } from "./history.js";

let busMapElements = {
  routeLine: null,
  stopMarkers: [],
};

let stopsLayerGroup = L.featureGroup();
let areStopsVisible = false;

export function initBusSystem() {
  const busBtn = document.getElementById("busScheduleBtn");
  const busModal = document.getElementById("busModal");
  const busClose = document.querySelector(".bus-close");
  const busLineSelect = document.getElementById("busLineSelect");
  const busDirection = document.getElementById("busDirection");
  const clearBusMapBtn = document.getElementById("clearBusMapBtn");
  const showStopsBtn = document.getElementById("showStopsOnMapBtn");

  loadBusLines();

  //deschide modal
  busBtn?.addEventListener("click", () => {
    busModal.style.display = "block";
  });

  //inchide modal
  busClose?.addEventListener("click", () => {
    busModal.style.display = "none";
  });

  //schimbare linie
  busLineSelect?.addEventListener("change", function () {
    const routeId = this.value;
    const direction = busDirection.value;
    if (routeId) {
      drawRoute(routeId, direction);
    } else {
      clearBusRouteFromMap();
    }
  });

  //schimbare direcție
  busDirection?.addEventListener("change", function () {
    const routeId = busLineSelect.value;
    const direction = this.value;
    if (routeId) {
      drawRoute(routeId, direction);
    }
  });

  //sterge traseu
  clearBusMapBtn?.addEventListener("click", function () {
    clearBusRouteFromMap();
    busLineSelect.value = "";
  });

  //arata/ascunde statii
  showStopsBtn?.addEventListener("click", async function () {
    if (areStopsVisible) {
      getMap().removeLayer(stopsLayerGroup);
      stopsLayerGroup.clearLayers();
      areStopsVisible = false;
    } else {
      await loadAndDisplayStops();
      areStopsVisible = true;
    }
  });
}

async function loadBusLines() {
  try {
    const response = await fetch("bus_api.php?action=get_routes");
    const data = await response.json();

    if (data.success) {
      const select = document.getElementById("busLineSelect");
      if (!select) return;

      select.innerHTML = '<option value="">Alege o linie...</option>';
      data.routes.forEach((route) => {
        const option = document.createElement("option");
        option.value = route.route_id;
        option.textContent = `Linia ${route.route_short_name} - ${route.route_long_name}`;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Eroare la încărcarea liniilor:", error);
  }
}

async function drawRoute(routeId, direction = 0) {
  clearBusRouteFromMap();
  try {
    const response = await fetch(
      `bus_api.php?action=get_route_shape&route_id=${routeId}&direction=${direction}`,
    );
    const data = await response.json();

    if (data.success) {
      document.getElementById("busInfo").style.display = "block";

      const latLngs = data.points.map((p) => [
        parseFloat(p.shape_pt_lat),
        parseFloat(p.shape_pt_lon),
      ]);
      busMapElements.routeLine = L.polyline(latLngs, {
        color: "#" + (data.color || "4e5044"),
        weight: 5,
      }).addTo(getMap());

      await loadStopsForRoute(routeId, direction);
      getMap().fitBounds(busMapElements.routeLine.getBounds());
    }
  } catch (e) {
    console.error("Eroare drawRoute:", e);
  }
}

async function loadStopsForRoute(routeId, direction) {
  try {
    const response = await fetch(
      `bus_api.php?action=get_stops_for_route&route_id=${routeId}&direction=${direction}`,
    );
    const data = await response.json();

    if (data.success && data.stops) {
      const listContainer = document.getElementById("busStopsList");
      const lineDetails = document.getElementById("busLineDetails");
      const lineBadge = document.getElementById("lineBadge");
      const lineName = document.getElementById("lineFullName");

      lineDetails.style.display = "block";
      listContainer.innerHTML = "";

      const select = document.getElementById("busLineSelect");
      const selectedText = select.options[select.selectedIndex].text;
      const parts = selectedText.split("-");

      lineBadge.textContent = parts[0].replace("Linia ", "").trim();
      lineName.textContent = parts[1] ? parts[1].trim() : "Traseu";

      data.stops.forEach((stop, index) => {
        const stopItem = document.createElement("div");
        stopItem.style =
          "padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; align-items: center; gap: 10px;";
        stopItem.innerHTML = `
          <div style="width: 18px; height: 18px; background: #707c66; color: white; border-radius: 50%; font-size: 10px; display: flex; align-items: center; justify-content: center;">
            ${index + 1}
          </div>
          <div style="font-size: 13px;">${stop.stop_name}</div>
        `;

        stopItem.onmouseover = () => (stopItem.style.background = "#f5f5f5");
        stopItem.onmouseout = () => (stopItem.style.background = "transparent");
        stopItem.onclick = () => {
          getMap().setView([stop.stop_lat, stop.stop_lon], 17);
          document.getElementById("busModal").style.display = "none";
        };

        listContainer.appendChild(stopItem);
      });
    }
  } catch (error) {
    console.error("Eroare la încărcarea stațiilor:", error);
  }
}

function clearBusRouteFromMap() {
  const map = getMap();
  if (busMapElements.routeLine) {
    map.removeLayer(busMapElements.routeLine);
    busMapElements.routeLine = null;
  }
  if (busMapElements.stopMarkers) {
    busMapElements.stopMarkers.forEach((m) => map.removeLayer(m));
    busMapElements.stopMarkers = [];
  }

  const lineDetails = document.getElementById("busLineDetails");
  const listContainer = document.getElementById("busStopsList");
  if (lineDetails) lineDetails.style.display = "none";
  if (listContainer) listContainer.innerHTML = "";
  document.getElementById("busInfo").style.display = "none";
}

async function loadAndDisplayStops() {
  try {
    stopsLayerGroup.clearLayers();
    const map = getMap();

    const response = await fetch("bus_api.php?action=get_all_stops");
    if (!response.ok) throw new Error("Eroare răspuns server");

    const data = await response.json();

    if (data.success && data.stops.length > 0) {
      data.stops.forEach((stop) => {
        const marker = L.circleMarker([stop.stop_lat, stop.stop_lon], {
          radius: 6,
          color: "#4e5044",
          fillColor: "#ffffff",
          fillOpacity: 1,
          weight: 2,
        });

        const safeStopId = stop.stop_id.replace(/[\/\\:.]/g, "_");
        const popupHtml = `
          <div style="min-width:180px;">
            <strong style="color:#4e5044; display:block; margin-bottom:5px;">${stop.stop_name}</strong>
            <div id="arrivals-container-${safeStopId}">
              <p style="font-size:11px; color:#666; margin-top:5px; text-align:center;">Apasă butonul pentru sosiri</p>
            </div>
            <button class="sosiri-live-btn" 
                    data-stopid="${stop.stop_id}"
                    data-safestopid="${safeStopId}"
                    style="width:100%; margin-top:8px; padding:8px; cursor:pointer; 
                           background:linear-gradient(145deg, #0d0e0c, #383f32, #2d2e26); 
                           color:white; border:none; border-radius:4px; 
                           font-size:11px; font-weight:bold;">
              📍 Vezi Sosiri Live
            </button>
          </div>`;

        marker.bindPopup(popupHtml);

        marker.on("popupopen", function () {
          const popup = this.getPopup();
          const popupElement = popup.getElement();

          setTimeout(() => {
            const button = popupElement?.querySelector(".sosiri-live-btn");
            if (button) {
              button.addEventListener("click", async function (e) {
                e.stopPropagation();
                const stopId = this.getAttribute("data-stopid");
                const safeStopId = this.getAttribute("data-safestopid");
                const container = popupElement.querySelector(
                  `#arrivals-container-${safeStopId}`,
                );

                if (!container) return;

                container.innerHTML =
                  '<div style="text-align:center;"><div class="loading-spinner-mini"></div> <span style="font-size:11px; color:#666;">Se încarcă...</span></div>';

                try {
                  const response = await fetch(
                    `bus_api.php?action=get_next_bus&stop_id=${encodeURIComponent(
                      stopId,
                    )}`,
                  );
                  const data = await response.json();

                  if (
                    data.success &&
                    data.arrivals &&
                    data.arrivals.length > 0
                  ) {
                    let html =
                      '<div style="border-top:1px solid #eee; padding-top:8px;">';
                    data.arrivals.slice(0, 5).forEach((bus) => {
                      const time = bus.arrival_time
                        ? bus.arrival_time.substring(0, 5)
                        : "--:--";
                      const color = bus.route_color || "4e5044";
                      trackBus(
                        bus.route_short_name,
                        stop.stop_name,
                        document.getElementById("busDirection")?.value || 0,
                        data.arrivals.length,
                      );
                      html += `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; padding:4px; background:rgba(0,0,0,0.03); border-radius:3px;">
                          <div style="display:flex; align-items:center;">
                            <div style="width:8px; height:8px; border-radius:50%; background:#${color}; margin-right:6px;"></div>
                            <span style="font-weight:bold; font-size:12px;">Linia ${bus.route_short_name}</span>
                          </div>
                          <span style="font-size:12px; font-weight:bold; color:#4e5044;">${time}</span>
                        </div>`;
                    });
                    container.innerHTML = html + "</div>";
                  } else {
                    container.innerHTML =
                      '<p style="font-size:11px; color:orange; text-align:center;">Fără sosiri în următoarea oră.</p>';
                  }
                } catch (error) {
                  container.innerHTML =
                    '<p style="font-size:11px; color:red; text-align:center;">Eroare la conexiune.</p>';
                }
              });
            }
          }, 100);
        });

        stopsLayerGroup.addLayer(marker);
      });

      stopsLayerGroup.addTo(map);

      if (stopsLayerGroup.getLayers().length > 0) {
        map.fitBounds(stopsLayerGroup.getBounds(), { padding: [50, 50] });
      }
    }
  } catch (e) {
    console.error("Eroare la încărcarea stațiilor:", e);
    showMessage("Nu s-au putut încărca datele de la server", "error");
  }
}
