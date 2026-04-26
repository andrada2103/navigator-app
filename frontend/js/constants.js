//constante si configurari globale
//url-uri api - detectie automata ngrok vs localhost
//coordonate implicite - centrul brasovului

const currentUrl = window.location.hostname;
const isNgrok = currentUrl.includes("ngrok-free.dev");
const BASE_URL = window.location.origin;

//url-uri pentru proxy-ul api
//pe localhost foloseste server local, pe ngrok foloseste url public pentru testare pe telefon
export const API_PROXY = `${BASE_URL}/navigator_app/backend/proxy_api.php`;
//coordonate implicite
export const DEFAULT_CENTER = [45.65, 25.6];
export const DEFAULT_ZOOM = 16;

//bounding box pentru judetul brasov
//folosit pentru a filtra rezltatele cautarilor
export const BRASOV_BBOX = "25.0,45.4,26.2,46.1";

export const OSRM_BASE_URL = "https://router.project-osrm.org/";

//stiluri pentru rute
export const ROUTE_STYLES = {
  driving: { color: "#4A90E2", weight: 6, opacity: 0.8 },
  walking: { color: "#50C878", weight: 4, opacity: 0.8, dashArray: "5, 10" },
  cycling: { color: "#FF6B35", weight: 5, opacity: 0.8, dashArray: "8, 8" },
};

//configurare iconite marker
export const MARKER_ICONS = {
  user: {
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  },
  start: {
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  },
  end: {
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  },
  intermediate: {
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png",
  },
};
