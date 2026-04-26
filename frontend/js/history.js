//istoric utilizator
import { getUser } from "./auth.js";
import { showMessage } from "../core/utils.js";
import { getMap } from "../core/map.js";
import { API_PROXY } from "../config/constants.js";

const DEBUG = true;

//tipuri de actiuni
export const ACTION_TYPES = {
  SEARCH: "search",
  ROUTE: "route",
  WEATHER: "weather",
  BUS: "bus",
  POI: "poi",
  FAVORITE: "favorite",
  REPORT: "report",
};

//categorie pentru istoric
class UserHistory {
  constructor() {
    this.history = [];
    this.maxItems = 100;
    this.init();
  }

  init() {
    this.loadFromStorage();
    this.setupListeners();
  }

  //incarcare din baza de date sau localStorage
  async loadFromStorage() {
    try {
      const user = getUser();

      if (!user) {
        //neautentificat - incarca din localStorage
        this.loadFromLocalStorage();

        //daca modalul e deschis - refresh la lista
        const historyModal = document.getElementById("historyModal");
        if (historyModal && historyModal.style.display === "block") {
          const filter =
            document.getElementById("historyTypeFilter")?.value || "all";
          renderHistoryList(filter);
        }
        return;
      }

      //utilizator autentificat - incarca din BD
      const response = await fetch("history_api.php?action=get", {
        credentials: "include",
      });
      const text = await response.text();

      try {
        const data = JSON.parse(text);
        if (data.success) {
          this.history = data.history || [];
          if (DEBUG)
            console.log(
              "✅ Istoric încărcat din BD:",
              this.history.length,
              "elemente",
            );

          const historyModal = document.getElementById("historyModal");
          if (historyModal && historyModal.style.display === "block") {
            const filter =
              document.getElementById("historyTypeFilter")?.value || "all";
            renderHistoryList(filter);
          }
        } else {
          if (DEBUG) console.error("Eroare server:", data.message);
          this.history = [];
        }
      } catch (e) {
        if (DEBUG)
          console.error("Răspunsul nu e JSON valid:", text.substring(0, 200));
        this.history = [];
      }
    } catch (error) {
      if (DEBUG) console.error("Eroare la încărcarea istoricului:", error);
      this.history = [];
    }
  }

  //incarca din localStorage pentru guest
  loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem("guestHistory");
      if (saved) {
        this.history = JSON.parse(saved);
      } else {
        this.history = [];
      }
    } catch (error) {
      console.error("Eroare la încărcarea din localStorage:", error);
      this.history = [];
    }
  }

  //salveaza in localStorage pentru guest
  saveToLocalStorage() {
    try {
      // Păstrăm doar itemele guest fara userId
      const guestHistory = this.history.filter(
        (item) => !item.userId && !item.user_id,
      );
      localStorage.setItem("guestHistory", JSON.stringify(guestHistory));
      if (DEBUG)
        console.log(`Salvate ${guestHistory.length} acțiuni în localStorage`);
    } catch (error) {
      console.error("Eroare la salvarea în localStorage:", error);
    }
  }

  //adauga o actiune in istoric
  async addAction(type, data, location = null) {
    const user = getUser();

    if (DEBUG)
      console.log(`🔍 Se salvează acțiune: ${type}`, { data, location });

    if (!user) {
      //localStorage
      //creeaza obiectul history
      const historyItem = {
        id: this.generateId(),
        type: type,
        data: data,
        location: location,
        timestamp: new Date().toISOString(),
        userId: null, //pentru guest
      };

      //adauga in array-ul local
      this.history.unshift(historyItem);

      //limiteaza numarul de iteme
      if (this.history.length > this.maxItems) {
        this.history = this.history.slice(0, this.maxItems);
      }

      this.saveToLocalStorage();
      document.dispatchEvent(new CustomEvent("history:updated"));
      return;
    }

    //salveaza in DB
    try {
      const response = await fetch("history_api.php?action=add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: type,
          data: data,
          lat: location?.lat,
          lng: location?.lng,
        }),
      });

      const text = await response.text();
      if (DEBUG) console.log("Răspuns server:", text);

      const result = JSON.parse(text);
      if (result.success) {
        if (DEBUG) console.log("✅ Acțiune salvată cu succes în BD");
        await this.loadFromStorage();
      } else {
        if (DEBUG) console.error("Eroare la salvare:", result);
      }
    } catch (error) {
      if (DEBUG) console.error("Eroare la salvare istoric:", error);
    }
  }

  //genereaza id unic
  generateId() {
    return Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  }

  //obtine locatia curenta aproximativa
  getCurrentLocation() {
    try {
      const map = getMap(); // ← asta returnează obiectul Leaflet corect
      if (map && map.getCenter) {
        const center = map.getCenter();
        return {
          lat: center.lat,
          lng: center.lng,
        };
      }
    } catch (error) {
      // Ignorăm eroarea
    }
    return null;
  }

  //obtine istoricul pentru utilizatorul curent
  getUserHistory(limit = 50) {
    const user = getUser();

    if (!user) {
      return this.history.slice(0, limit);
    }

    //filtreaza dupa userId pentru user autentificat
    const filtered = this.history.filter((item) => {
      const itemUserId = item.userId || item.user_id;
      return itemUserId == user.id;
    });

    return filtered.slice(0, limit);
  }

  //obtine istoricul dupa tip
  getHistoryByType(type, limit = 20) {
    const user = getUser();

    if (!user) {
      return this.history.filter((item) => item.type === type).slice(0, limit);
    }

    return this.history
      .filter((item) => {
        const itemUserId = item.userId || item.user_id;
        const itemType = item.type || item.action_type;
        return itemUserId == user.id && itemType === type;
      })
      .slice(0, limit);
  }

  //sterge istoricul utilizatorului
  async clearUserHistory() {
    const user = getUser();

    if (!user) {
      this.history = [];
      localStorage.removeItem("guestHistory");
      document.dispatchEvent(new CustomEvent("history:cleared"));
      return;
    }

    try {
      await fetch("history_api.php?action=clear", {
        credentials: "include",
      });
      this.history = [];
      document.dispatchEvent(new CustomEvent("history:cleared"));
    } catch (error) {
      console.error("Eroare la ștergere istoric:", error);
    }
  }

  //sterge tot istoricul - admin
  clearAllHistory() {
    this.history = [];
    localStorage.removeItem("guestHistory");
    document.dispatchEvent(new CustomEvent("history:cleared"));
  }

  // Setup event listeners pentru actiuni
  setupListeners() {
    //cautari
    document.addEventListener("search:performed", (e) => {
      this.addAction(
        ACTION_TYPES.SEARCH,
        {
          query: e.detail.query,
          results: e.detail.resultsCount,
          selected: e.detail.selected,
        },
        e.detail.location,
      );
    });

    //rute calculate
    document.addEventListener("route:calculated", (e) => {
      this.addAction(
        ACTION_TYPES.ROUTE,
        {
          from: e.detail.from,
          to: e.detail.to,
          waypoints: e.detail.waypoints,
          transportType: e.detail.transportType,
          distance: e.detail.distance,
          duration: e.detail.duration,
        },
        e.detail.location,
      );
    });

    //vreme verificata
    document.addEventListener("weather:checked", (e) => {
      this.addAction(
        ACTION_TYPES.WEATHER,
        {
          location: e.detail.locationName,
          lat: e.detail.lat,
          lng: e.detail.lng,
          temperature: e.detail.temperature,
          condition: e.detail.condition,
        },
        { lat: e.detail.lat, lng: e.detail.lng },
      );
    });

    //autobuz verificat
    document.addEventListener("bus:checked", (e) => {
      this.addAction(
        ACTION_TYPES.BUS,
        {
          line: e.detail.line,
          stop: e.detail.stop,
          direction: e.detail.direction,
          arrivals: e.detail.arrivals,
        },
        e.detail.location,
      );
    });

    //POI vizualizat
    document.addEventListener("poi:viewed", (e) => {
      this.addAction(
        ACTION_TYPES.POI,
        {
          category: e.detail.category,
          name: e.detail.name,
          address: e.detail.address,
          distance: e.detail.distance,
        },
        { lat: e.detail.lat, lng: e.detail.lng },
      );
    });

    //favorite adaugate
    document.addEventListener("favorite:added", (e) => {
      this.addAction(
        ACTION_TYPES.FAVORITE,
        {
          name: e.detail.name,
          address: e.detail.address,
          category: e.detail.category,
        },
        { lat: e.detail.lat, lng: e.detail.lng },
      );
    });

    //rapoarte
    document.addEventListener("report:submitted", (e) => {
      this.addAction(
        ACTION_TYPES.REPORT,
        {
          category: e.detail.category,
          description: e.detail.description,
        },
        e.detail.location,
      );
    });
  }

  //export istoric în CSV
  async exportToCSV() {
    const user = getUser();

    if (!user) {
      this.exportGuestToCSV();
      return;
    }

    window.location.href = "history_api.php?action=export";
  }

  exportGuestToCSV() {
    if (this.history.length === 0) {
      showMessage("Nu există istoric de exportat", "info");
      return;
    }

    //creeaza continut CSV
    let csv = "Data,Tip,Detalii,Locație\n";

    this.history.forEach((item) => {
      const date = new Date(item.timestamp).toLocaleString("ro-RO");
      const details = this.formatDataForCSV(item.data);
      const location = item.location
        ? `${item.location.lat}, ${item.location.lng}`
        : "-";

      csv += `"${date}","${item.type}","${details}","${location}"\n`;
    });

    //download CSV
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `istoric_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  getTypeLabel(type) {
    const labels = {
      [ACTION_TYPES.SEARCH]: "🔍 Căutare",
      [ACTION_TYPES.ROUTE]: "🛣️ Rută",
      [ACTION_TYPES.WEATHER]: "🌤️ Vreme",
      [ACTION_TYPES.BUS]: "🚌 Autobuz",
      [ACTION_TYPES.POI]: "🏢 POI",
      [ACTION_TYPES.FAVORITE]: "⭐ Favorit",
      [ACTION_TYPES.REPORT]: "⚠️ Raport",
    };
    return labels[type] || type;
  }

  formatDataForCSV(data) {
    if (!data) return "-";
    return JSON.stringify(data)
      .replace(/,/g, ";")
      .replace(/"/g, "")
      .replace(/[{}]/g, "");
  }
}

//singleton
export const userHistory = new UserHistory();
window.userHistory = userHistory;

//functii helper pentru evenimente din alte module
export function trackSearch(query, resultsCount, selected) {
  document.dispatchEvent(
    new CustomEvent("search:performed", {
      detail: {
        query,
        resultsCount,
        selected,
        location: userHistory.getCurrentLocation(),
      },
    }),
  );
}

export function trackRoute(
  from,
  to,
  waypoints,
  transportType,
  distance,
  duration,
) {
  document.dispatchEvent(
    new CustomEvent("route:calculated", {
      detail: {
        from,
        to,
        waypoints,
        transportType,
        distance,
        duration,
        location: userHistory.getCurrentLocation(),
      },
    }),
  );
}

export function trackWeather(locationName, lat, lng, temperature, condition) {
  document.dispatchEvent(
    new CustomEvent("weather:checked", {
      detail: { locationName, lat, lng, temperature, condition },
    }),
  );
}

export function trackBus(line, stop, direction, arrivals) {
  document.dispatchEvent(
    new CustomEvent("bus:checked", {
      detail: {
        line,
        stop,
        direction,
        arrivals,
        location: userHistory.getCurrentLocation(),
      },
    }),
  );
}

export function trackPOI(category, name, address, lat, lng, distance) {
  document.dispatchEvent(
    new CustomEvent("poi:viewed", {
      detail: { category, name, address, lat, lng, distance },
    }),
  );
}

export function trackFavorite(name, address, lat, lng, category) {
  document.dispatchEvent(
    new CustomEvent("favorite:added", {
      detail: { name, address, lat, lng, category },
    }),
  );
}

export function trackReport(category, description, location) {
  document.dispatchEvent(
    new CustomEvent("report:submitted", {
      detail: { category, description, location },
    }),
  );
}

//initializare
export function initHistory() {
  if (DEBUG) console.log("Sistem istoric utilizator inițializat");
  return userHistory;
}

//initializare UI istoric
export function initHistoryUI() {
  const historyBtn = document.getElementById("historyBtn");
  const historyModal = document.getElementById("historyModal");
  const closeBtn = document.querySelector(".history-close");
  const typeFilter = document.getElementById("historyTypeFilter");
  const exportBtn = document.getElementById("exportHistoryBtn");
  const clearBtn = document.getElementById("clearHistoryBtn");

  if (!historyBtn || !historyModal) return;

  //deschide modal
  historyBtn.addEventListener("click", async () => {
    historyModal.style.display = "block";
    await userHistory.loadFromStorage();
    renderHistoryList("all");
  });

  //inchide modal
  closeBtn.addEventListener("click", () => {
    historyModal.style.display = "none";
  });

  //filtrare
  typeFilter.addEventListener("change", (e) => {
    renderHistoryList(e.target.value);
  });

  //export CSV
  exportBtn.addEventListener("click", () => {
    userHistory.exportToCSV();
  });

  //sterge istoric
  clearBtn.addEventListener("click", async () => {
    if (confirm("Ești sigur că vrei să ștergi tot istoricul?")) {
      await userHistory.clearUserHistory();
      await userHistory.loadFromStorage();
      const currentFilter = typeFilter.value;
      renderHistoryList(currentFilter);
    }
  });

  //inchide la click in afara modalului
  window.addEventListener("click", (e) => {
    if (e.target === historyModal) {
      historyModal.style.display = "none";
    }
  });

  //ajustări CSS
  setTimeout(() => {
    const modalBody = document.querySelector("#historyModal .modal-body");
    if (modalBody) {
      modalBody.style.display = "flex";
      modalBody.style.flexDirection = "column";
      modalBody.style.height = "calc(100% - 60px)";
      modalBody.style.overflow = "hidden";
    }

    const historyList = document.getElementById("historyList");
    if (historyList) {
      historyList.style.flex = "1";
      historyList.style.overflowY = "auto";
      historyList.style.maxHeight = "none";
    }
  }, 100);
}

//funcrie pentru afisarea istoricului
function renderHistoryList(filterType = "all") {
  const historyList = document.getElementById("historyList");
  if (!historyList) return;

  let history =
    filterType === "all"
      ? userHistory.getUserHistory(100)
      : userHistory.getHistoryByType(filterType, 100);

  if (history.length === 0) {
    historyList.innerHTML = `
      <div style="text-align: center; padding: 60px; color: #666;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="#ccc">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-.5-13v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
        </svg>
        <p style="margin-top: 10px;">Nu există activități în istoric</p>
      </div>
    `;
    return;
  }

  let html = "";
  history.forEach((item) => {
    const date = new Date(item.timestamp).toLocaleString("ro-RO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    html += `
      <div class="history-item" style="padding: 15px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 15px;">
        <div style="font-size: 24px;">${getTypeEmoji(item.type)}</div>
        <div style="flex: 1;">
          <div style="font-weight: bold; margin-bottom: 5px;">${getTypeLabel(item.type)}</div>
          <div style="font-size: 13px; color: #666;">${formatHistoryData(item.data, item.type)}</div>
          <div style="font-size: 11px; color: #999; margin-top: 5px;">${date}</div>
        </div>
        ${
          shouldShowLocationButton(item)
            ? `
          <button class="history-location-btn" data-lat="${item.location.lat}" data-lng="${item.location.lng}" data-type="${item.type}" data-id="${item.id}" style="padding: 5px 10px; background: #4e5044; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            📍 Arată
          </button>
        `
            : ""
        }
      </div>
    `;
  });

  historyList.innerHTML = html;

  //event listeners pentru butoane
  document.querySelectorAll(".history-location-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const lat = parseFloat(this.dataset.lat);
      const lng = parseFloat(this.dataset.lng);
      const type = this.dataset.type;
      const id = this.dataset.id;
      const item = history.find((h) => h.id === id);
      window.goToHistoryLocation(lat, lng, item?.data, type);
    });
  });
}

//verifica daca butonul "Arată" trebuie afisat
function shouldShowLocationButton(item) {
  if (!item.location) return false;
  const typesWithLocation = ["search", "poi", "favorite", "report"];
  return typesWithLocation.includes(item.type);
}

function getTypeEmoji(type) {
  const emojis = {
    search: "🔍",
    route: "🛣️",
    weather: "🌤️",
    bus: "🚌",
    poi: "🏢",
    favorite: "⭐",
    report: "⚠️",
  };
  return emojis[type] || "📌";
}

function getTypeLabel(type) {
  const labels = {
    search: "Căutare locație",
    route: "Rută calculată",
    weather: "Verificare vreme",
    bus: "Autobuz verificat",
    poi: "POI vizualizat",
    favorite: "Loc favorit",
    report: "Raport problemă",
  };
  return labels[type] || type;
}

function formatHistoryData(data, type) {
  if (!data) return "-";

  switch (type) {
    case "search":
      return `🔍 "${data.query}" (${data.results || 0} rezultate)`;
    case "route":
      return `🛣️ De: ${data.from || "?"} → La: ${data.to || "?"} (${data.transportType || "mașină"}) - ${data.distance || "?"} km, ${data.duration || "?"} min`;
    case "weather":
      return `🌤️ ${data.location || "?"} - ${data.temperature || "?"}°C, ${data.condition || "?"}`;
    case "bus":
      return `🚌 Linia ${data.line || "?"} - Stația ${data.stop || "?"} (${data.arrivals || 0} sosiri)`;
    case "poi":
      return `🏢 ${data.name || "?"} - ${data.category || "?"} (${data.distance ? (data.distance < 1 ? Math.round(data.distance * 1000) + "m" : data.distance.toFixed(1) + "km") : "?"})`;
    case "favorite":
      return `⭐ ${data.name || "?"} - ${data.category || "favorit"}`;
    case "report":
      return `⚠️ ${data.category || "?"}: ${data.description || "fără descriere"}`;
    default:
      return JSON.stringify(data).substring(0, 100);
  }
}

//functie globala pentru navigare la locatie cu marker
window.goToHistoryLocation = (lat, lng, itemData = null, itemType = null) => {
  try {
    const map = getMap();
    if (!map) {
      showMessage("Harta nu este disponibilă", "error");
      return;
    }

    map.setView([lat, lng], 16);

    if (window.historyMarker) {
      map.removeLayer(window.historyMarker);
      window.historyMarker = null;
    }

    const markerIcon = L.divIcon({
      html: `<div style="background: #4e5044; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px;">📌</div>`,
      className: "history-marker",
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

    window.historyMarker = L.marker([lat, lng], { icon: markerIcon }).addTo(
      map,
    );

    let popupContent = "";

    if (itemData && itemType) {
      switch (itemType) {
        case "search":
          popupContent = `<b>🔍 Căutare:</b> ${itemData.query || "Locație"}`;
          break;
        case "poi":
          popupContent = `<b>🏢 ${itemData.name || "POI"}</b><br>${itemData.address || ""}<br><small>${itemData.category || ""}</small>`;
          break;
        case "favorite":
          popupContent = `<b>⭐ ${itemData.name || "Favorit"}</b><br>${itemData.address || ""}`;
          break;
        case "report":
          popupContent = `<b>⚠️ Raport:</b> ${itemData.category || ""}<br>${itemData.description || ""}`;
          break;
        default:
          popupContent = `<b>Locație din istoric</b><br>Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}`;
      }

      window.historyMarker
        .bindPopup(
          `<div style="min-width: 200px; padding: 5px;">${popupContent}</div>`,
        )
        .openPopup();
    } else {
      fetch(`${API_PROXY}?action=reverse_geocode&lat=${lat}&lon=${lng}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.features && data.features.length > 0) {
            const address = data.features[0].properties.formatted;
            window.historyMarker
              .bindPopup(
                `<div style="min-width: 200px; padding: 5px;"><b>📍 ${address}</b></div>`,
              )
              .openPopup();
          } else {
            window.historyMarker
              .bindPopup(
                `<div style="min-width: 200px; padding: 5px;"><b>📍 Locație</b><br>Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}</div>`,
              )
              .openPopup();
          }
        })
        .catch(() => {
          window.historyMarker
            .bindPopup(
              `<div style="min-width: 200px; padding: 5px;"><b>📍 Locație</b><br>Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}</div>`,
            )
            .openPopup();
        });
    }

    const removeMarker = () => {
      if (window.historyMarker) {
        try {
          getMap().removeLayer(window.historyMarker);
        } catch (e) {
          console.warn("Eroare la ștergere marker:", e);
        }
        window.historyMarker = null;
      }
    };

    window.historyMarker.on("popupclose", removeMarker);
    window.historyMarker.on("remove", removeMarker);

    const checkInterval = setInterval(() => {
      if (window.historyMarker && !window.historyMarker.isPopupOpen()) {
        removeMarker();
        clearInterval(checkInterval);
      }
    }, 1000);

    setTimeout(() => clearInterval(checkInterval), 10000);

    document.getElementById("historyModal").style.display = "none";
  } catch (error) {
    console.error("Eroare la navigare:", error);
    showMessage("Eroare la navigare", "error");
  }
};

// Pentru debugging în consolă
window.debugHistory = {
  userHistory: userHistory,
  renderHistoryList: renderHistoryList,
  loadFromStorage: () => userHistory.loadFromStorage(),
};
