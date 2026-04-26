//geolocatie
import { getMap } from "../core/map.js";
import { createMarker } from "../core/map.js";
import { showMessage } from "../core/utils.js";
import { API_PROXY } from "../config/constants.js";

let userMarker = null;
export let userCoords = null;
let clickMarker = null;

//returneaza coordonatele
export function getUserCoords() {
  return userCoords;
}

//returneaza markerul utilizatorului
export function getUserMarker() {
  return userMarker;
}

//returneaza markerul de pe harta la click
export function getClickMarker() {
  return clickMarker;
}

//seteaza markerul de pe harta la click
export function setClickMarker(marker) {
  clickMarker = marker;
}

//initializare geolocatie
export function initGeolocation() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        userCoords = [lat, lon];

        if (!userMarker) {
          userMarker = createMarker(lat, lon, "user");
          userMarker.bindPopup("<b>Locația ta</b>");
        } else {
          userMarker.setLatLng(userCoords);
        }

        document.dispatchEvent(
          new CustomEvent("geolocation:updated", {
            detail: { coords: userCoords },
          }),
        );
      },
      (error) => {
        console.error("Eroare la obținerea poziției: ", error);
        showMessage("Nu am putut obține locația ta", "error");
      },
    );
  } else {
    showMessage("Geolocația nu este suportată", "error");
  }

  initDynamicLocationWidget();
}

//widget dinamic pentru locatie si vreme - coordonate + temp
function initDynamicLocationWidget() {
  const map = getMap();

  const DynamicLocationControl = L.Control.extend({
    options: { position: "bottomleft" },
    onAdd: function () {
      const container = L.DomUtil.create("div", "dynamic-weather-control");
      container.id = "dynamic-location-widget";
      container.innerHTML = `<div class="loading-spinner-mini"></div> <span>Localizare...</span>`;
      return container;
    },
  });

  map.addControl(new DynamicLocationControl());

  let moveTimeout;
  map.on("moveend", () => {
    const widget = document.getElementById("dynamic-location-widget");
    if (widget) {
      widget.innerHTML = `<div class="loading-spinner-mini"></div> <span>Se actualizează...</span>`;
    }

    clearTimeout(moveTimeout);
    moveTimeout = setTimeout(updateLocationData, 800);
  });

  updateLocationData();
}

//actualizeaza datele de locatie si vreme in widget
async function updateLocationData() {
  const map = getMap();
  const center = map.getCenter();
  const lat = center.lat;
  const lon = center.lng;
  const widget = document.getElementById("dynamic-location-widget");
  if (!widget) return;

  let locationName = "Brașov"; //valoare default

  //reverse geocoding pentru numele localitatii
  try {
    const geoResponse = await fetch(
      `${API_PROXY}?action=reverse_geocode&lat=${lat}&lon=${lon}`,
    );

    if (!geoResponse.ok) {
      throw new Error(`Geocoding failed: ${geoResponse.status}`);
    }

    const geoData = await geoResponse.json();

    if (geoData.features && geoData.features.length > 0) {
      const props = geoData.features[0].properties;
      locationName =
        props.city ||
        props.town ||
        props.village ||
        props.municipality ||
        "Brașov";
    }
  } catch (error) {
    console.warn("Eroare reverse geocoding, folosesc Brașov:", error);
  }

  //vreme
  try {
    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`,
    );

    if (!weatherResponse.ok) {
      throw new Error(`Weather API failed: ${weatherResponse.status}`);
    }

    const weatherData = await weatherResponse.json();
    const temp = Math.round(weatherData.current.temperature_2m);

    widget.innerHTML = `
      <span class="city-name">${locationName}</span>
      <span style="opacity: 0.5">|</span>
      <span class="temp-value">${temp}°C</span>
    `;
  } catch (error) {
    console.error("Eroare widget vreme:", error);
    widget.innerHTML = `<span class="city-name">${locationName}</span>`;
  }
}

//reverse geocoding pentru click pe harta
export async function getAddressFromCoordinates(lat, lng) {
  try {
    const response = await fetch(
      `${API_PROXY}?action=reverse_geocode&lat=${lat}&lon=${lng}`,
    );
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      return (
        data.features[0].properties.formatted || "Locație fără adresă specifică"
      );
    }
    return "Locație necunoscută";
  } catch (err) {
    console.error("Eroare la obținerea adresei:", err);
    return null;
  }
}

//centreaza harta pe locatia utilizatorului
export function centerOnUser() {
  if (userCoords) {
    getMap().setView(userCoords, 16);
    if (userMarker) userMarker.openPopup();
  } else {
    showMessage("Locația ta nu este disponibilă momentan", "error");
  }
}

window.centerOnUser = centerOnUser;
