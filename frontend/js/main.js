//initializare harta, module, evenimente globale

import { initMap, addCustomControls } from "./core/map.js";
import { highlightBrasov } from "./core/brasov-boundary.js";
import { initGeolocation } from "./modules/geolocation.js";
import {
  initSearch,
  addClickMarker,
  clearSearchMarker,
} from "./modules/search.js";
import { initRouting } from "./modules/routing.js";
import { initWeatherSystem } from "./modules/weather.js";
import { initBusSystem } from "./modules/bus.js";
import { initPOISystem } from "./modules/poi.js";
import { initFavoritesSystem } from "./modules/favorites.js";
import { initReportSystem } from "./modules/reports.js";
import { initMapViewModes } from "./modules/map-modes.js";
import { initAuth } from "./modules/auth.js";
import { initModals } from "./ui/modals.js";
import { showMessage } from "./core/utils.js";
import { initHistory, initHistoryUI } from "./modules/history.js";
import { initMultiModal } from "./modules/multiModal.js";

document.addEventListener("DOMContentLoaded", function () {
  //initializare harta
  const map = initMap();
  map.setZoom(16);
  addCustomControls(map);

  //initializare geolocatie
  initGeolocation();

  //click pe harta
  map.on("click", function (e) {
    if (window.reportSystem && window.reportSystem.isPickingLocation) {
      window.reportSystem.handleMapClick(e);
      return;
    }
    addClickMarker(e);
  });

  //evenimente custom
  document.addEventListener("map:recenter", function () {
    import("./modules/geolocation.js").then((module) => {
      if (module.centerOnUser) {
        module.centerOnUser();
      } else {
        // Fallback
        const coords = module.userCoords;
        if (coords) {
          map.setView(coords, 16);
          if (module.userMarker) module.userMarker.openPopup();
        } else {
          showMessage("Poziția ta nu este disponibilă încă.", "error");
        }
      }
    });
  });

  document.addEventListener("map:clear-click-marker", function () {
    clearSearchMarker();
  });

  function initHamburgerMenu() {
    const hamburger = document.getElementById("hamburgerBtn");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");

    if (!hamburger || !sidebar || !overlay) return;

    hamburger.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebar.classList.toggle("open");
      overlay.classList.toggle("active");
    });

    overlay.addEventListener("click", () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("active");
    });

    const sidebarButtons = sidebar.querySelectorAll(".sidebar-btn");
    sidebarButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (window.innerWidth <= 1024) {
          sidebar.classList.remove("open");
          overlay.classList.remove("active");
        }
      });
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 1024) {
        sidebar.classList.remove("open");
        overlay.classList.remove("active");
      }
    });
  }
  const demoToggleBtn = document.getElementById("demoToggleBtn");
  const demoPanel = document.getElementById("demoPanel");
  const chevron = document.getElementById("demoChevron");

  if (demoToggleBtn && demoPanel && chevron) {
    // Toggle panel
    demoToggleBtn.addEventListener("click", function () {
      if (demoPanel.style.display === "none") {
        demoPanel.style.display = "block";
        chevron.textContent = "▲";
      } else {
        demoPanel.style.display = "none";
        chevron.textContent = "▼";
      }
    });

    // Click pe un rând
    document.querySelectorAll(".block-row").forEach((row) => {
      row.addEventListener("click", async function () {
        const blockId = this.dataset.block;
        const statusSpan = this.querySelector(".block-status");
        const isActive = statusSpan.textContent === "activ";

        await toggleBlock(blockId, !isActive);

        statusSpan.textContent = !isActive ? "activ" : "inactiv";
        statusSpan.style.background = !isActive ? "#4CAF50" : "#f44336";

        if (window.currentRoute) {
          const calcBtn = document.getElementById("calculateRouteBtn");
          if (calcBtn) calcBtn.click();
        }
      });
    });
  }

  //trimite cererea catre backend pentru a bloca/debloca o strada
  async function toggleBlock(blockId, active) {
    try {
      await fetch("backend/routing_graph_api.php?action=toggle_block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ block_id: blockId, active: active }),
      });
    } catch (error) {
      console.error("Eroare toggle block:", error);
    }
  }

  initRouting();
  initAuth();
  initBusSystem();
  initMapViewModes();
  initPOISystem();
  initReportSystem();
  initWeatherSystem();
  initFavoritesSystem();
  initSearch();
  initModals();
  initHistory();
  initHistoryUI();
  initMultiModal();
  initHamburgerMenu();
  highlightBrasov(map);
});
