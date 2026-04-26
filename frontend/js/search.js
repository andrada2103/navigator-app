//cautare locatii - geoapify
import { getMap, createMarker } from "../core/map.js";
import { debounce } from "../core/utils.js";
import { API_PROXY } from "../config/constants.js";
import { getAddressFromCoordinates } from "./geolocation.js";
import { showWeatherInPopup } from "./weather.js";
import { trackSearch } from "./history.js";

let searchMarker = null;
let searchResultsContainer = null;
let searchInput = null;

//initializare
export function initSearch() {
  searchInput = document.getElementById("searchInput");
  searchResultsContainer = document.getElementById("searchResults");
  const searchForm = document.getElementById("searchForm");

  if (!searchInput || !searchResultsContainer || !searchForm) return;

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    performSearch();
  });

  searchInput.addEventListener(
    "input",
    debounce(() => {
      performSearch();
    }, 400),
  );

  searchInput.addEventListener("blur", () => {
    setTimeout(() => {
      searchResultsContainer.style.display = "none";
    }, 200);
  });
}

//cauta locatii folosind api-ul de geocoding
//rezultatele sunt filtrate sa fie doar in judetul brasov
export async function performSearch() {
  const query = searchInput.value.trim();

  if (query.length < 3) {
    searchResultsContainer.style.display = "none";
    return;
  }

  try {
    const response = await fetch(
      `${API_PROXY}?action=geocode&query=${encodeURIComponent(query + ", Brașov")}`,
    );
    const data = await response.json();
    const results = data.features;

    searchResultsContainer.innerHTML = "";

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

          li.addEventListener("click", (e) => {
            e.stopPropagation();
            selectLocation(place);
          });

          fragment.appendChild(li);
        }
      });

      if (foundResults) {
        searchResultsContainer.appendChild(fragment);
        searchResultsContainer.style.display = "block";
      } else {
        searchResultsContainer.innerHTML = `
      <li class="result-item">
        <div class="result-details">Nu s-au găsit rezultate în județul Brașov</div>
      </li>
    `;
        searchResultsContainer.style.display = "block";
      }
    }
  } catch (err) {
    console.error("Eroare la căutare:", err);
    searchResultsContainer.innerHTML = "<li>Eroare la căutare</li>";
    searchResultsContainer.style.display = "block";
  }
}

//selecteaza o locatie din rezultate si centreaza harta
export async function selectLocation(place) {
  const lat = place.geometry.coordinates[1];
  const lon = place.geometry.coordinates[0];
  const locationName = place.properties.formatted;
  const map = getMap();

  if (searchMarker) {
    map.removeLayer(searchMarker);
  }

  searchMarker = createMarker(lat, lon, "user");

  const popupContent = await showWeatherInPopup(lat, lon, locationName);

  if (popupContent) {
    searchMarker.bindPopup(popupContent).openPopup();
  } else {
    searchMarker.bindPopup(`<b>${locationName}</b>`).openPopup();
  }

  map.setView([lat, lon], 15);
  searchResultsContainer.style.display = "none";
  searchInput.value = locationName;

  //salveaza in istoric
  trackSearch(locationName, 1, locationName);
}

//adauga un marker la click pe harta
export function addClickMarker(e) {
  const map = getMap();
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;

  map.closePopup();

  if (searchMarker) {
    map.removeLayer(searchMarker);
  }

  searchMarker = createMarker(lat, lng, "user");

  getAddressFromCoordinates(lat, lng).then((address) => {
    const popupContent = `
      <div style="min-width: 200px;">
        <b>${address || "Locație selectată"}</b>
        <hr style="margin: 8px 0;">
        <div style="font-size: 12px; color: white; font-weight: 300;">
          <strong>Coordonate:</strong><br>
          Lat: ${lat.toFixed(6)}<br>
          Lng: ${lng.toFixed(6)}
        </div>
      </div>
    `;
    searchMarker.bindPopup(popupContent).openPopup();
  });
}

//returneaza markerul curent de cautare
export function getSearchMarker() {
  return searchMarker;
}

//sterge markerul curent de cautare de pe harta
export function clearSearchMarker() {
  if (searchMarker) {
    getMap().removeLayer(searchMarker);
    searchMarker = null;
  }
}
