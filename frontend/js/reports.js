//sistem raportare probleme
import { getMap } from "../core/map.js";
import { showMessage } from "../core/utils.js";
import { trackReport } from "./history.js";

export class ReportSystem {
  constructor() {
    this.activeReports = [];
    this.isPickingLocation = false;
    this.tempCoords = null;
    this.init();
  }

  init() {
    const reportBtn = document.getElementById("reportIssueBtn");
    const modal = document.getElementById("reportModal");
    const closeBtn = document.querySelector(".report-close");
    const submitBtn = document.getElementById("submitReportBtn");

    if (!reportBtn) return;

    reportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.isPickingLocation = true;
      document.getElementById("map").style.cursor = "crosshair";
      showMessage("Apasă pe hartă unde este problema", "info");
      document.getElementById("sidebar")?.classList.remove("open");
    });

    closeBtn.addEventListener("click", () => {
      this.resetMode();
      modal.style.display = "none";
    });

    submitBtn.onclick = () => this.submitReport();
  }

  resetMode() {
    this.isPickingLocation = false;
    document.getElementById("map").style.cursor = "";
  }

  handleMapClick(e) {
    this.tempCoords = e.latlng;
    this.resetMode();

    document.getElementById("reportModal").style.display = "block";
    document.getElementById("reportLocationText").innerHTML =
      `<strong>Locație selectată:</strong> ${e.latlng.lat.toFixed(
        5,
      )}, ${e.latlng.lng.toFixed(5)}`;
  }

  submitReport() {
    const categorySelect = document.getElementById("reportCategory");
    const descInput = document.getElementById("reportDescription");

    if (!this.tempCoords) {
      showMessage("Selectează locația pe hartă mai întâi!", "error");
      return;
    }

    const reportData = {
      lat: this.tempCoords.lat,
      lng: this.tempCoords.lng,
      categoryText: categorySelect.options[categorySelect.selectedIndex].text,
      description: descInput.value,
      time: new Date().toLocaleTimeString("ro-RO", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    //track in istoric
    if (typeof trackReport === "function") {
      trackReport(reportData.categoryText, reportData.description, {
        lat: reportData.lat,
        lng: reportData.lng,
      });
    }

    this.renderMarker(reportData);

    document.getElementById("reportModal").style.display = "none";
    descInput.value = "";
    this.tempCoords = null;
    showMessage("Raportul a fost trimis", "success");
  }

  renderMarker(data) {
    const reportIcon = L.divIcon({
      html: `<div class="report-marker-pulse">⚠️</div>`,
      className: "custom-report-icon",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    const marker = L.marker([data.lat, data.lng], {
      icon: reportIcon,
      zIndexOffset: 1000,
    });

    const container = L.DomUtil.create("div", "report-popup-container");

    const header = L.DomUtil.create("div", "report-popup-header", container);
    header.innerHTML = data.categoryText;

    if (data.description && data.description.trim() !== "") {
      const desc = L.DomUtil.create("div", "report-popup-desc", container);
      desc.innerHTML = `"${data.description}"`;
    }

    const deleteBtn = L.DomUtil.create(
      "button",
      "report-delete-btn",
      container,
    );
    deleteBtn.innerHTML = "Rezolvat";
    deleteBtn.onclick = () => {
      getMap().removeLayer(marker);
    };

    const timeSpan = L.DomUtil.create("span", "report-popup-time", container);
    timeSpan.innerHTML = `🕒 Raportat la ora: ${data.time}`;

    marker.addTo(getMap()).bindPopup(container).openPopup();
  }
}

export function initReportSystem() {
  window.reportSystem = new ReportSystem();
}
