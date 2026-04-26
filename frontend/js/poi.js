//sistem puncte de interes
import { getMap } from "../core/map.js";
import { showMessage, calculateDistance } from "../core/utils.js";
import { trackPOI } from "./history.js";

export class POISystem {
  constructor() {
    this.pointsOfInterest = [];
    this.poiMarkers = [];
    this.userLocation = null;
    this.searchCache = new Map();
    this.isLoading = false;
    this.currentPoiCategory = null;

    this.categories = {
      benzinarie: {
        name: "⛽ Benzinării",
        searchTerms: ["stație combustibil", "benzinarie"],
        overpassTag: "amenity=fuel",
      },
      hotel: {
        name: "🏨 Hoteluri",
        searchTerms: ["hotel", "cazare"],
        overpassTag: "tourism=hotel",
      },
      farmacie: {
        name: "💊 Farmacii",
        searchTerms: ["farmacie"],
        overpassTag: "amenity=pharmacy",
      },
      bancomat: {
        name: "🏧 Bancomate",
        searchTerms: ["bancomat", "atm"],
        overpassTag: "amenity=atm",
      },
      restaurant: {
        name: "🍽️ Restaurante",
        searchTerms: ["restaurant"],
        overpassTag: "amenity=restaurant",
      },
      mall: {
        name: "🛍️ Mall-uri",
        searchTerms: ["mall", "centru comercial"],
        overpassTag: "shop=mall",
      },
      spital: {
        name: "🏥 Spitale",
        searchTerms: ["spital", "clinică"],
        overpassTag: "amenity=hospital",
      },
      parcare: {
        name: "🅿️ Parcări",
        searchTerms: ["parcare"],
        overpassTag: "amenity=parking",
      },
    };
  }

  //initializare
  init() {
    const poiToggleBtn = document.getElementById("poiToggleBtn");
    const poiContainer = document.getElementById("poiContainer");
    const closePoiBtn = document.getElementById("closePoiBtn");

    if (!poiToggleBtn || !poiContainer || !closePoiBtn) {
      console.error("Elementele POI nu au fost găsite");
      return;
    }

    this.getUserLocation();
    this.setupEventListeners();
  }

  //obtine locatia utilizatorului
  getUserLocation() {
    if (!navigator.geolocation) {
      showMessage("Geolocația nu este suportată", "error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      },
      (error) => {
        console.error("Eroare geolocație:", error);
        showMessage("Nu s-a putut obține locația ta", "error");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  //configureaza event listener-ul pentru ui
  setupEventListeners() {
    const poiToggleBtn = document.getElementById("poiToggleBtn");
    const poiContainer = document.getElementById("poiContainer");
    const closePoiBtn = document.getElementById("closePoiBtn");
    const categoryBtns = document.querySelectorAll(".poi-category-btn");

    poiToggleBtn.addEventListener("click", () => {
      poiContainer.classList.toggle("show");
    });

    closePoiBtn.addEventListener("click", () => {
      poiContainer.classList.remove("show");
    });

    categoryBtns.forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (this.isLoading) return;

        categoryBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        this.currentPoiCategory = btn.getAttribute("data-category");

        if (this.currentPoiCategory && this.userLocation) {
          await this.searchNearbyPOI(this.currentPoiCategory);
        } else {
          this.clearPOIData();
          this.renderPOIResults();
        }
      });
    });

    document.addEventListener("click", (e) => {
      if (
        !poiContainer.contains(e.target) &&
        !poiToggleBtn.contains(e.target)
      ) {
        poiContainer.classList.remove("show");
      }
    });
  }

  //cauta poi in apropiere folosind overpass api
  async searchNearbyPOI(category) {
    if (!this.userLocation) {
      showMessage("Locația ta nu este disponibilă", "error");
      return;
    }

    if (this.isLoading) return;

    this.isLoading = true;
    this.showLoadingState();

    try {
      const cacheKey = this.generateCacheKey(category);
      let results = this.searchCache.get(cacheKey);
      let isLiveData = true;

      if (!results) {
        results = await this.searchPlacesOverpass(category, 2000);

        if (results.length > 0) {
          this.searchCache.set(cacheKey, results);
        } else {
          isLiveData = false;
          results = this.getFallbackPOI(category);
        }
      }

      this.pointsOfInterest = this.processPOIResults(results, category);
      this.renderPOIResults(isLiveData);
    } catch (error) {
      console.error("Eroare la căutare POI:", error);
      this.handleSearchError(category);
    } finally {
      this.isLoading = false;
    }
  }

  //genereaza cheie de cache pentru cautare
  generateCacheKey(category) {
    const roundedLat = Math.round(this.userLocation.lat * 1000) / 1000;
    const roundedLng = Math.round(this.userLocation.lng * 1000) / 1000;
    return `${category}_${roundedLat}_${roundedLng}`;
  }

  //cauta locatii folosind overpass api
  async searchPlacesOverpass(category, radius = 2000) {
    const overpassQuery = this.getOptimizedOverpassQuery(category, radius);
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
      overpassQuery,
    )}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();

      if (data.elements && data.elements.length > 0) {
        return data.elements
          .filter((element) => element.tags && element.tags.name)
          .map((element) => this.formatOverpassResult(element))
          .filter((place) => place.distance <= radius / 1000)
          .sort((a, b) => a.distance - b.distance);
      }
      return [];
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Timeout la căutare. Serverul este lent.");
      }
      throw error;
    }
  }

  //construieste query overpass optimizat
  getOptimizedOverpassQuery(category, radius) {
    const baseQueries = {
      benzinarie: `[out:json][timeout:10];node["amenity"="fuel"](around:${radius},${this.userLocation.lat},${this.userLocation.lng});out body;`,
      hotel: `[out:json][timeout:10];node["tourism"="hotel"](around:${radius},${this.userLocation.lat},${this.userLocation.lng});out body;`,
      farmacie: `[out:json][timeout:10];node["amenity"="pharmacy"](around:${radius},${this.userLocation.lat},${this.userLocation.lng});out body;`,
      bancomat: `[out:json][timeout:10];node["amenity"="atm"](around:${radius},${this.userLocation.lat},${this.userLocation.lng});out body;`,
      restaurant: `[out:json][timeout:10];node["amenity"~"restaurant|cafe|fast_food"](around:${radius},${this.userLocation.lat},${this.userLocation.lng});out body;`,
      mall: `[out:json][timeout:10];node["shop"="mall"](around:${radius},${this.userLocation.lat},${this.userLocation.lng});out body;`,
      spital: `[out:json][timeout:10];node["amenity"="hospital"](around:${radius},${this.userLocation.lat},${this.userLocation.lng});out body;`,
      parcare: `[out:json][timeout:10];node["amenity"="parking"](around:${radius},${this.userLocation.lat},${this.userLocation.lng});out body;`,
    };
    return baseQueries[category] || baseQueries.restaurant;
  }

  //formateaza rezultatul overpass in format standard
  formatOverpassResult(element) {
    return {
      id: element.id,
      name: element.tags.name,
      address: this.getOverpassAddress(element),
      lat: element.lat,
      lng: element.lon,
      rawData: element,
      distance: calculateDistance(
        this.userLocation.lat,
        this.userLocation.lng,
        element.lat,
        element.lon,
      ),
    };
  }

  //extrage adresa din datele overpass
  getOverpassAddress(element) {
    if (element.tags["addr:street"]) {
      return `${element.tags["addr:street"]}${
        element.tags["addr:housenumber"]
          ? " " + element.tags["addr:housenumber"]
          : ""
      }, Brașov`;
    }
    return element.tags["addr:city"] || "Brașov";
  }

  //proceseaza si elimina duplicatele din rezultate
  processPOIResults(results, category) {
    const uniqueResults = results.filter(
      (result, index, self) =>
        index ===
        self.findIndex(
          (r) =>
            r.id === result.id ||
            (r.name === result.name &&
              calculateDistance(r.lat, r.lng, result.lat, result.lng) < 0.05),
        ),
    );

    return uniqueResults
      .map((poi) => ({
        ...poi,
        category: category,
        description: this.getPOIDescription(poi.rawData, category),
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  //afiseaza rezultatele in ui
  renderPOIResults(isLiveData = null) {
    const poiResults = document.getElementById("poiResults");
    const actualIsLiveData =
      isLiveData !== null
        ? isLiveData
        : this.isLiveDataCheck(this.pointsOfInterest);
    poiResults.innerHTML = this.generateResultsHTML(
      this.pointsOfInterest,
      actualIsLiveData,
    );
    this.attachItemEventListeners(this.pointsOfInterest, actualIsLiveData);
  }

  //genereaza html pentru lista de rezultate
  generateResultsHTML(poiArray, isLiveData) {
    if (poiArray.length === 0) {
      return `
        <div class="no-results">
          <p>🔍 Nu s-au găsit rezultate pentru "${this.getCategoryName(
            this.currentPoiCategory,
          )}"</p>
          <small>Încearcă o altă categorie</small>
        </div>
      `;
    }

    return poiArray
      .map((poi) => this.generatePOIItemHTML(poi, isLiveData))
      .join("");
  }

  //genereaza html pentru un element poi
  generatePOIItemHTML(poi, isLiveData) {
    const distanceText =
      poi.distance < 1
        ? Math.round(poi.distance * 1000) + " m"
        : poi.distance.toFixed(1) + " km";

    const dataIndicator = isLiveData
      ? '<span class="poi-live-indicator">🌐 LIVE</span>'
      : '<span class="poi-demo-indicator">📋 DEMO</span>';

    return `
      <div class="poi-item" data-poi-id="${poi.id}">
        <div class="poi-item-header">
          <div class="poi-item-name">${poi.name}</div>
          <div class="poi-item-meta">
            <div class="poi-item-distance">${distanceText}</div>
            ${dataIndicator}
          </div>
        </div>
        <div class="poi-item-address">${poi.address}</div>
        <div class="poi-item-category">${this.getCategoryName(
          poi.category,
        )} • ${poi.description}</div>
      </div>
    `;
  }

  //afiseaza event listenere pentru elem poi
  attachItemEventListeners(poiArray, isLiveData) {
    poiArray.forEach((poi) => {
      const itemElement = document.querySelector(`[data-poi-id="${poi.id}"]`);
      if (itemElement) {
        itemElement.addEventListener("click", () => {
          this.showPOIOnMap(poi, isLiveData);
          document.getElementById("poiContainer").classList.remove("show");
        });
      }
    });
  }

  //afiseaza poi pe harta
  showPOIOnMap(poi, isLiveData = true) {
    this.clearPOIFromMap();

    const marker = L.marker([poi.lat, poi.lng]).addTo(getMap());

    const distanceText =
      poi.distance < 1
        ? Math.round(poi.distance * 1000) + " m"
        : poi.distance.toFixed(1) + " km";

    if (typeof trackPOI === "function") {
      trackPOI(
        poi.category,
        poi.name,
        poi.address,
        poi.lat,
        poi.lng,
        poi.distance,
      );
    }
    const popupContent = `
      <div class="poi-popup">
        <h4>${poi.name}</h4>
        <p><strong>Categorie:</strong> ${this.getCategoryName(poi.category)}</p>
        <p><strong>Adresă:</strong> ${poi.address}</p>
        <p><strong>Distanță:</strong> ${distanceText}</p>
        <p><em>${poi.description}</em></p>
      </div>
    `;

    marker.bindPopup(popupContent).openPopup();
    this.poiMarkers.push(marker);
    getMap().setView([poi.lat, poi.lng], 16, { animate: true });
  }

  //curata markerii poi de pe harta
  clearPOIFromMap() {
    this.poiMarkers.forEach((marker) => {
      if (marker) getMap().removeLayer(marker);
    });
    this.poiMarkers = [];
  }

  //returneaza numele categoriei in romana
  getCategoryName(category) {
    const names = {
      benzinarie: "Benzinărie",
      hotel: "Hotel",
      farmacie: "Farmacie",
      bancomat: "Bancomat",
      restaurant: "Restaurant",
      mall: "Mall",
      spital: "Spital",
      parcare: "Parcare",
    };
    return names[category] || category;
  }

  //returneaza descrierea
  getPOIDescription(rawData, category) {
    if (rawData?.tags?.cuisine) return `Restaurant ${rawData.tags.cuisine}`;
    const descriptions = {
      benzinarie: "Stație de combustibil",
      hotel: "Cazare",
      farmacie: "Farmacie",
      bancomat: "Bancomat",
      restaurant: "Restaurant",
      mall: "Centru comercial",
      spital: "Unitare medicală",
      parcare: "Parcare",
    };
    return descriptions[category] || "Punct de interes";
  }

  //verifica daca datele sunt live sau demo
  isLiveDataCheck(poiArray) {
    if (poiArray.length === 0) return false;
    const firstItem = poiArray[0];
    return (
      typeof firstItem.id === "number" ||
      (typeof firstItem.id === "string" && !firstItem.id.includes("-"))
    );
  }

  //afiseaza starea de incarcare in ui
  showLoadingState() {
    document.getElementById("poiResults").innerHTML = `
      <div class="poi-loading">
        <div class="loading-spinner"></div>
        <p>Se caută puncte de interes...</p>
      </div>
    `;
  }

  //trateaza erorile de cautare
  handleSearchError(category) {
    this.pointsOfInterest = this.getFallbackPOI(category);
    this.renderPOIResults(false);
    showMessage("Se folosesc date demo (eroare conexiune)", "info");
  }

  //curata datele poi
  clearPOIData() {
    this.pointsOfInterest = [];
    this.clearPOIFromMap();
  }

  //fallback - returneaza date demo
  getFallbackPOI(category) {
    const fallbackData = {
      benzinarie: [
        {
          id: "omv-1",
          name: "OMV",
          lat: 45.6523,
          lng: 25.6105,
          address: "Calea București 140",
        },
        {
          id: "petrom-1",
          name: "Petrom",
          lat: 45.6358,
          lng: 25.5723,
          address: "Strada Mănăstirii 45",
        },
      ],
      hotel: [
        {
          id: "aro-1",
          name: "Hotel Aro Palace",
          lat: 45.6412,
          lng: 25.5898,
          address: "Bulevardul Eroilor 27",
        },
      ],
      farmacie: [
        {
          id: "dona-1",
          name: "Farmacia Dona",
          lat: 45.6405,
          lng: 25.5902,
          address: "Strada Republicii 10",
        },
      ],
      bancomat: [
        {
          id: "brd-1",
          name: "BRD Bancomat",
          lat: 45.6418,
          lng: 25.5894,
          address: "Piața Sfatului 15",
        },
      ],
      restaurant: [
        {
          id: "sergiana-1",
          name: "Sergiana",
          lat: 45.6398,
          lng: 25.5865,
          address: "Strada Mureșenilor 28",
        },
      ],
      mall: [
        {
          id: "coresi-1",
          name: "Coresi Shopping Resort",
          lat: 45.6254,
          lng: 25.5623,
          address: "Strada Zaharia Stancu 1",
        },
      ],
      spital: [
        {
          id: "judetean-1",
          name: "Spitalul Județean",
          lat: 45.6358,
          lng: 25.5814,
          address: "Bulevardul Eroilor 27",
        },
      ],
      parcare: [
        {
          id: "p1-1",
          name: "Parcare Centrală",
          lat: 45.641,
          lng: 25.588,
          address: "Piața Sfatului",
        },
      ],
    };

    const fallbackPOI = fallbackData[category] || [];
    return fallbackPOI
      .map((poi) => ({
        ...poi,
        category: category,
        description: this.getPOIDescription({}, category),
        distance: calculateDistance(
          this.userLocation.lat,
          this.userLocation.lng,
          poi.lat,
          poi.lng,
        ),
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  destroy() {
    this.clearPOIFromMap();
    this.searchCache.clear();
    this.pointsOfInterest = [];
  }
}

//initializeaza sistemul poi - singleton
export function initPOISystem() {
  if (!window.poiSystem) {
    window.poiSystem = new POISystem();
    window.poiSystem.init();
  }

  return window.poiSystem;
}
