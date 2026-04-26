//harta leaflet initializare
//initializare harta cu centrul in brasov
//gestionare markeri
//butoane custom - recentrare, stergere marker
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MARKER_ICONS,
} from "../config/constants.js";

let mapInstance = null;

//initializare
//daca harta exista deja, o returneaza pe cea existenta - singleton
export function initMap() {
  if (mapInstance) return mapInstance;

  //creeaza harta cu centrul in brasov si zoom
  mapInstance = L.map("map").setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  //adauga stratul de baza - osm
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(mapInstance);

  mapInstance.zoomControl.setPosition("bottomleft");

  return mapInstance;
}

//returneaza instanta hartii
export function getMap() {
  if (!mapInstance) {
    return initMap();
  }
  return mapInstance;
}

//creeaza un marker pe harta la coordonatele specificate
//start, stop, user, intermediate
export function createMarker(lat, lng, type = "default", options = {}) {
  const map = getMap();
  const iconConfig = MARKER_ICONS[type] || MARKER_ICONS.user;

  const icon = L.icon({
    iconUrl: iconConfig.iconUrl,
    shadowUrl: MARKER_ICONS.user.shadowUrl,
    iconSize: iconConfig.iconSize || MARKER_ICONS.user.iconSize,
    iconAnchor: iconConfig.iconAnchor || MARKER_ICONS.user.iconAnchor,
    popupAnchor: iconConfig.popupAnchor || MARKER_ICONS.user.popupAnchor,
    shadowSize: MARKER_ICONS.user.shadowSize,
  });

  return L.marker([lat, lng], { icon, ...options }).addTo(map);
}

//sterge toti markerii dintr-un array
export function clearMarkers(markersArray) {
  if (!markersArray) return;
  markersArray.forEach((marker) => {
    if (marker && marker.remove) {
      marker.remove();
    }
  });
}

//adauga butoane custom in partea dreapta sus a hartii
//recentrare - trimite evenimentul map:recenter (geolocation)
//stergere marker - trimite evenimentul map:clear-click-marker (search.js)
export function addCustomControls(map) {
  const customControls = L.control({ position: "topright" });

  customControls.onAdd = function () {
    const div = L.DomUtil.create("div", "custom-controls-container");
    div.style.display = "flex";
    div.style.flexDirection = "column";
    div.style.marginRight = "10px";
    div.style.marginTop = "10px";

    //buton recentrare
    const recenterBtn = L.DomUtil.create(
      "div",
      "leaflet-bar leaflet-control leaflet-control-custom",
    );
    recenterBtn.title = "Recenter pe locația mea";
    recenterBtn.innerHTML = `
  <svg width="20" height="20" viewBox="0 0 297 297" fill="currentColor">
    <path d="M148.5,0C87.43,0,37.747,49.703,37.747,110.797c0,91.026,99.729,179.905,103.976,183.645 c1.936,1.705,4.356,2.559,6.777,2.559c2.421,0,4.841-0.853,6.778-2.559c4.245-3.739,103.975-92.618,103.975-183.645 C259.253,49.703,209.57,0,148.5,0z M148.5,272.689c-22.049-21.366-90.243-93.029-90.243-161.892 c0-49.784,40.483-90.287,90.243-90.287s90.243,40.503,90.243,90.287C238.743,179.659,170.549,251.322,148.5,272.689z"/>
    <path d="M148.5,59.183c-28.273,0-51.274,23.154-51.274,51.614c0,28.461,23.001,51.614,51.274,51.614 c28.273,0,51.274-23.153,51.274-51.614C199.774,82.337,176.773,59.183,148.5,59.183z M148.5,141.901 c-16.964,0-30.765-13.953-30.765-31.104c0-17.15,13.801-31.104,30.765-31.104c16.964,0,30.765,13.953,30.765,31.104 C179.265,127.948,165.464,141.901,148.5,141.901z"/>
  </svg>
`;
    recenterBtn.style.background = "#141a15eb";
    recenterBtn.style.width = "30px";
    recenterBtn.style.height = "30px";
    recenterBtn.style.cursor = "pointer";
    recenterBtn.style.display = "flex";
    recenterBtn.style.alignItems = "center";
    recenterBtn.style.justifyContent = "center";
    recenterBtn.style.borderRadius = "4px";
    recenterBtn.style.boxShadow = "0 1px 5px rgba(0,0,0,0.4)";
    recenterBtn.style.color = "#888888ff";

    recenterBtn.onclick = function (e) {
      e.stopPropagation();
      e.preventDefault();
      document.dispatchEvent(new CustomEvent("map:recenter"));
    };

    //buton stergere marker
    const clearMarkerBtn = L.DomUtil.create(
      "div",
      "leaflet-bar leaflet-control leaflet-control-custom",
    );
    clearMarkerBtn.title = "Șterge markerul plasat";
    clearMarkerBtn.innerHTML = `
  <svg width="16" height="16" viewBox="-3.5 0 19 19" fill="currentColor">
    <path d="M11.383 13.644A1.03 1.03 0 0 1 9.928 15.1L6 11.172 2.072 15.1a1.03 1.03 0 1 1-1.455-1.456l3.928-3.928L.617 5.79a1.03 1.03 0 1 1 1.455-1.456L6 8.261l3.928-3.928a1.03 1.03 0 0 1 1.455 1.456L7.455 9.716z"/>
  </svg>
`;
    clearMarkerBtn.style.background = "#141a15eb";
    clearMarkerBtn.style.width = "30px";
    clearMarkerBtn.style.height = "30px";
    clearMarkerBtn.style.cursor = "pointer";
    clearMarkerBtn.style.display = "flex";
    clearMarkerBtn.style.alignItems = "center";
    clearMarkerBtn.style.justifyContent = "center";
    clearMarkerBtn.style.borderRadius = "4px";
    clearMarkerBtn.style.boxShadow = "0 1px 5px rgba(0,0,0,0.4)";
    clearMarkerBtn.style.color = "#888888ff";

    clearMarkerBtn.onclick = function (e) {
      e.stopPropagation();
      e.preventDefault();
      document.dispatchEvent(new CustomEvent("map:clear-click-marker"));
    };

    div.appendChild(recenterBtn);
    div.appendChild(clearMarkerBtn);

    return div;
  };

  customControls.addTo(map);
}
