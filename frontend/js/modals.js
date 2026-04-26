//gestionare modaluri - butonul x, click in afara ferestrei. tasta ESC
export function initModals() {
  document.querySelectorAll(".modal .close").forEach((closeBtn) => {
    closeBtn.addEventListener("click", () => {
      closeBtn.closest(".modal").style.display = "none";
    });
  });

  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.style.display = "none";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document
        .querySelectorAll(".modal[style*='display: block']")
        .forEach((modal) => {
          modal.style.display = "none";
        });
    }
  });
}
