// ================================================
// CONFIGURAȚII MARKERI LEAFLET
// ================================================

import * as L from "https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js";

//configurare markeri standard
export const MARKER_CONFIG = {
  user: {
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  },
  start: {
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  },
  end: {
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  },
  intermediate: {
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  },
};

//factory function pentru creare markeri
export function createLeafletIcon(type = "user") {
  const config = MARKER_CONFIG[type] || MARKER_CONFIG.user;
  return L.icon({
    iconUrl: config.iconUrl,
    shadowUrl: config.shadowUrl,
    iconSize: config.iconSize,
    iconAnchor: config.iconAnchor,
    popupAnchor: config.popupAnchor,
    shadowSize: config.shadowSize,
  });
}

//iconite personalizate pentru POI si rapoarte
export const CUSTOM_ICONS = {
  report: L.divIcon({
    html: `<div class="report-marker-pulse">⚠️</div>`,
    className: "custom-report-icon",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  }),

  busStop: L.divIcon({
    html: `<div style="background: #4e5044; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
    className: "bus-stop-icon",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  }),

  favorite: (category) => {
    const colors = {
      favorite: "#ff6b6b",
      home: "#4ecdc4",
      work: "#45b7d1",
    };
    const color = colors[category] || "#4e5044";
    return L.divIcon({
      html: `<div style="background: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 12px;">⭐</div>`,
      className: "favorite-icon",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  },
};

//configurare layer-uri tile
export const TILE_LAYERS = {
  standard: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri",
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap, CartoDB",
  },
  relief: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap, OpenTopoMap",
  },
};

//optiuni pentru popup-uri
export const POPUP_OPTIONS = {
  maxWidth: 300,
  minWidth: 200,
  className: "custom-popup",
};

//optiuni pentru tooltip-uri
export const TOOLTIP_OPTIONS = {
  permanent: false,
  direction: "top",
  className: "custom-tooltip",
};
