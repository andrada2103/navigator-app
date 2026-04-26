//sistem favorite - localStorage+db
import { getMap, createMarker } from "../core/map.js";
import { showMessage } from "../core/utils.js";
import { API_PROXY } from "../config/constants.js";
import { setEndPoint } from "./routing.js";
import { getUser } from "./auth.js";

let favoritesSystem = {
  favorites: [],
  currentCategory: null,
  selectedFavoriteId: null,
};

let favoriteMarkers = {};

export function initFavoritesSystem() {
  initFAB();
  loadFavorites();
  initFavoritesModal();

  //evenimentele de autentificare/deconectare
  document.addEventListener("auth:login", syncFavoritesOnLogin);
  document.addEventListener("auth:logout", syncFavoritesOnLogout);
}

//functii de sync cu baza de date

//incarca favoritele în functie de starea autentificarii
async function loadFavorites() {
  clearAllFavoriteMarkers();

  const user = getUser();

  if (user) {
    console.log("🔄 Loading favorites from DB for user:", user.id);
    await loadUserFavoritesFromDB(user.id);
  } else {
    console.log("🔄 Loading favorites from localStorage (guest)");
    loadGuestFavorites();
  }

  favoritesSystem.favorites.forEach(addFavoriteMarker);
}

//incarca favoritele din baza de date
async function loadUserFavoritesFromDB(userId) {
  try {
    const response = await fetch("favorites_api.php?action=get");
    const data = await response.json();

    if (data.success) {
      favoritesSystem.favorites = data.favorites || [];
    } else {
      console.error("Eroare la încărcarea din BD:", data.message);
      favoritesSystem.favorites = [];
    }
  } catch (error) {
    console.error("Eroare la fetch:", error);
    favoritesSystem.favorites = [];
  }
}

//incarca favoritele pentru utilizator neautentificat
function loadGuestFavorites() {
  try {
    const saved = localStorage.getItem("userFavorites");
    if (saved) {
      favoritesSystem.favorites = JSON.parse(saved);
    } else {
      favoritesSystem.favorites = [];
    }
  } catch (error) {
    console.error("Eroare la încărcarea favoritelor guest:", error);
    favoritesSystem.favorites = [];
  }
}

//curata toti markerii de pe harta
function clearAllFavoriteMarkers() {
  Object.values(favoriteMarkers).forEach((marker) => {
    if (marker && getMap()) {
      getMap().removeLayer(marker);
    }
  });
  favoriteMarkers = {};
}

//salveaza favoritele
function saveFavorites() {
  const user = getUser();
  if (user) return; //user autentificat - salvarea se face individual prin API

  //guest - localStorage
  try {
    localStorage.setItem(
      "userFavorites",
      JSON.stringify(favoritesSystem.favorites),
    );
  } catch (error) {
    console.error("Eroare la salvarea favoritelor guest:", error);
  }
}

//sync la autentificare
async function syncFavoritesOnLogin() {
  const user = getUser();
  if (!user) return;

  //ia favoritele din localStorage
  let guestFavorites = [];
  try {
    const saved = localStorage.getItem("userFavorites");
    if (saved) guestFavorites = JSON.parse(saved);
  } catch (error) {
    console.error("Eroare la citirea guest favorites:", error);
  }

  if (guestFavorites.length > 0) {
    //trimite la server pentru sync
    try {
      const response = await fetch("favorites_api.php?action=sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorites: guestFavorites }),
      });

      const data = await response.json();

      if (data.success) {
        //sterge din localStorage
        localStorage.removeItem("userFavorites");

        //reincarca din BD
        await loadUserFavoritesFromDB(user.id);

        //reafiseaza
        refreshFavoritesOnMap();

        showMessage(`✅ ${data.added} favorite sincronizate`, "success");
      }
    } catch (error) {
      console.error("Eroare la sync:", error);
    }
  } else {
    //daca nu are guest favorites, incarca din BD
    await loadUserFavoritesFromDB(user.id);
    refreshFavoritesOnMap();
  }
}

//sync la deconectare
async function syncFavoritesOnLogout() {
  const user = getUser();
  if (!user) return;

  //la deconectare nu se mai salveaza nimic in localStorage, doar se curata

  clearAllFavoriteMarkers();

  // resetează favoritele
  favoritesSystem.favorites = [];

  //sterge localStorage complet
  localStorage.removeItem("userFavorites");

  //re-render lista daca modal e deschis
  const modal = document.getElementById("favoritesModal");
  if (modal && modal.style.display === "block") {
    renderFavoritesList();
  }
}

//reimprospateaza markerii pe harta
function refreshFavoritesOnMap() {
  // Șterge toți markerii vechi
  clearAllFavoriteMarkers();

  //adauga markerii noi
  favoritesSystem.favorites.forEach(addFavoriteMarker);

  //re-render lista in modal
  renderFavoritesList();
}

//initializare
function initFAB() {
  const fabMain = document.getElementById("fabMainBtn");
  const fabMenu = document.querySelector(".fab-menu");
  const fabFavoritesBtn = document.getElementById("fabFavoritesBtn");
  const fabHomeBtn = document.getElementById("fabHomeBtn");
  const fabWorkBtn = document.getElementById("fabWorkBtn");

  fabMain.addEventListener("click", (e) => {
    e.stopPropagation();
    fabMain.classList.toggle("active");
    fabMenu.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (!fabMain.contains(e.target) && !fabMenu.contains(e.target)) {
      fabMain.classList.remove("active");
      fabMenu.classList.remove("show");
    }
  });

  fabFavoritesBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showFavoritesModal();
    fabMain.classList.remove("active");
    fabMenu.classList.remove("show");
  });

  fabHomeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigateToFavoriteCategory("home");
    fabMain.classList.remove("active");
    fabMenu.classList.remove("show");
  });

  fabWorkBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigateToFavoriteCategory("work");
    fabMain.classList.remove("active");
    fabMenu.classList.remove("show");
  });
}

function initFavoritesModal() {
  const modal = document.getElementById("favoritesModal");
  const closeBtn = modal.querySelector(".favorites-close");
  const showAddFormBtn = document.getElementById("showAddFormBtn");
  const cancelFavoriteBtn = document.getElementById("cancelFavoriteBtn");
  const newFavoriteForm = document.getElementById("newFavoriteForm");
  const useCurrentLocationBtn = document.getElementById(
    "useCurrentLocationBtn",
  );
  const categoryBadges = document.querySelectorAll(".category-badge");

  window.showFavoritesModal = function (category = null) {
    modal.style.display = "block";
    favoritesSystem.currentCategory = category;
    renderFavoritesList();

    if (category) {
      const titles = {
        favorite: "⭐ Locuri favorite",
        home: "🏠 Acasă",
        work: "💼 Muncă",
      };
      document.getElementById("favoritesModalTitle").textContent =
        titles[category] || "Locuri favorite";
    }
  };

  closeBtn.addEventListener("click", () => (modal.style.display = "none"));
  window.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  showAddFormBtn.addEventListener("click", () => {
    document.getElementById("addFavoriteForm").style.display = "block";
    document.getElementById("favoriteName").focus();
  });

  cancelFavoriteBtn.addEventListener("click", () => {
    document.getElementById("addFavoriteForm").style.display = "none";
    newFavoriteForm.reset();
    resetCategoryBadges();
  });

  categoryBadges.forEach((badge) => {
    badge.addEventListener("click", () => {
      categoryBadges.forEach((b) => b.classList.remove("selected"));
      badge.classList.add("selected");
    });
  });

  useCurrentLocationBtn.addEventListener("click", async () => {
    import("./geolocation.js").then(async (module) => {
      const coords = module.userCoords;
      if (coords) {
        try {
          const response = await fetch(
            `${API_PROXY}?action=reverse_geocode&lat=${coords[0]}&lon=${coords[1]}`,
          );
          const data = await response.json();
          if (data.features?.[0]) {
            document.getElementById("favoriteAddress").value =
              data.features[0].properties.formatted;
            showMessage("Adresa a fost completată automat");
          }
        } catch (error) {
          showMessage("Nu s-a putut obține adresa", "error");
        }
      } else {
        showMessage("Locația ta nu este disponibilă", "error");
      }
    });
  });

  newFavoriteForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("favoriteName").value.trim();
    const address = document.getElementById("favoriteAddress").value.trim();
    const selectedBadge = document.querySelector(".category-badge.selected");
    const category = selectedBadge
      ? selectedBadge.getAttribute("data-category")
      : "favorite";

    if (!name || !address) {
      showFavoritesMessage("Completează numele și adresa", "error");
      return;
    }

    try {
      const response = await fetch(
        `${API_PROXY}?action=geocode&query=${encodeURIComponent(address)}`,
      );
      const data = await response.json();

      if (data.features?.[0]) {
        const feature = data.features[0];
        const lat = feature.geometry.coordinates[1];
        const lng = feature.geometry.coordinates[0];

        const favorite = {
          id: "fav_" + Date.now(), //ID temporar
          name,
          address,
          lat,
          lng,
          category,
          created: new Date().toISOString(),
        };

        const user = getUser();

        if (user) {
          //utilizator autentificat - salveaza in bd
          const saveResponse = await fetch("favorites_api.php?action=add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: favorite.name,
              address: favorite.address,
              lat: favorite.lat,
              lng: favorite.lng,
              category: favorite.category,
            }),
          });

          const saveData = await saveResponse.json();

          if (saveData.success) {
            //actualizeaza ID-ul cu cel din bd
            favorite.id = saveData.id;
            favoritesSystem.favorites.push(favorite);
            showFavoritesMessage("Loc adăugat la favorite!", "success");
            addFavoriteMarker(favorite);
          } else {
            showFavoritesMessage("Eroare la salvare", "error");
          }
        } else {
          //guest - salveaza în localStorage
          favoritesSystem.favorites.push(favorite);
          saveFavorites(); //salveaza in localStorage
          showFavoritesMessage("Loc adăugat la favorite!", "success");
          addFavoriteMarker(favorite);
        }

        newFavoriteForm.reset();
        resetCategoryBadges();
        document.getElementById("addFavoriteForm").style.display = "none";
        renderFavoritesList();
      } else {
        showFavoritesMessage("Adresa nu a fost găsită", "error");
      }
    } catch (error) {
      console.error("Eroare la adăugare favorit:", error);
      showFavoritesMessage("Eroare la adăugare", "error");
    }
  });
}

function resetCategoryBadges() {
  document
    .querySelectorAll(".category-badge")
    .forEach((b) => b.classList.remove("selected"));
  document
    .querySelector('.category-badge[data-category="favorite"]')
    ?.classList.add("selected");
}

function renderFavoritesList() {
  const container = document.getElementById("favoritesList");
  let favorites = favoritesSystem.favorites;

  if (favoritesSystem.currentCategory) {
    favorites = favorites.filter(
      (f) => f.category === favoritesSystem.currentCategory,
    );
  }

  if (favorites.length === 0) {
    const message = favoritesSystem.currentCategory
      ? `Nu ai locuri în categoria "${getCategoryName(
          favoritesSystem.currentCategory,
        )}"`
      : "Nu ai locuri favorite. Adaugă unul!";
    container.innerHTML = `<p style="text-align: center; color: #666; font-size: 14px;">${message}</p>`;
    return;
  }

  favorites.sort((a, b) => {
    if (a.category !== b.category) {
      const catOrder = { home: 1, work: 2, favorite: 3 };
      return catOrder[a.category] - catOrder[b.category];
    }
    return new Date(b.created) - new Date(a.created);
  });

  const itemsHTML = favorites
    .map(
      (favorite) => `
    <div class="favorite-item" data-fav-id="${favorite.id}">
      <div class="favorite-info">
        <h4>${getCategoryIcon(favorite.category)} ${favorite.name}
          <span style="font-size: 11px; color: #888; font-weight: normal;">${getCategoryName(
            favorite.category,
          )}</span>
        </h4>
        <p>${favorite.address}</p>
      </div>
      <div class="favorite-actions">
        <button class="favorite-action-btn" title="Arată pe hartă" onclick="window.navigateToFavorite('${
          favorite.id
        }')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
        </button>
        <button class="favorite-action-btn" title="Folosește în rutare" onclick="window.useFavoriteInRouting('${
          favorite.id
        }')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm4 9h-3v3h-2v-3H8V9h3V6h2v3h3v2z"/></svg>
        </button>
        <button class="favorite-action-btn" title="Șterge" onclick="window.deleteFavorite('${
          favorite.id
        }')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </div>
  `,
    )
    .join("");

  container.innerHTML = itemsHTML;
}

function navigateToFavoriteCategory(category) {
  const categoryFavorite = favoritesSystem.favorites.find(
    (f) => f.category === category,
  );

  if (categoryFavorite) {
    navigateToFavorite(categoryFavorite.id);
  } else {
    showMessage(`Nu ai un loc setat ca "${getCategoryName(category)}"`, "info");
    showFavoritesModal();
    document.getElementById("addFavoriteForm").style.display = "block";

    document
      .querySelectorAll(".category-badge")
      .forEach((b) => b.classList.remove("selected"));
    document
      .querySelector(`.category-badge[data-category="${category}"]`)
      ?.classList.add("selected");
    document.getElementById("favoriteName").value = getCategoryName(category);
    document.getElementById("favoriteName").focus();
  }
}

function navigateToFavorite(favoriteId) {
  const favorite = favoritesSystem.favorites.find((f) => f.id == favoriteId);
  if (!favorite) return;

  import("./search.js").then((module) => {
    module.clearSearchMarker();

    const marker = createMarker(favorite.lat, favorite.lng, "user");
    const popupContent = `
      <div style="min-width: 200px;">
        <h4 style="margin: 0 0 8px 0;">${getCategoryIcon(favorite.category)} ${
          favorite.name
        }</h4>
        <p style="margin: 0 0 8px 0; font-size: 12px;">${favorite.address}</p>
        <div style="font-size: 11px; color: #666;">${getCategoryName(
          favorite.category,
        )}</div>
      </div>
    `;
    marker.bindPopup(popupContent).openPopup();
    getMap().setView([favorite.lat, favorite.lng], 15);
    showMessage(`Navigare către: ${favorite.name}`);
  });
}

function useFavoriteInRouting(favoriteId) {
  const favorite = favoritesSystem.favorites.find((f) => f.id == favoriteId);
  if (!favorite) return;

  document.getElementById("toggleRoutePanelBtn")?.click();
  document.getElementById("endPoint").value = favorite.name;
  setEndPoint(favorite.lat, favorite.lng);
  showMessage(`Destinație setată: ${favorite.name}`);
}

async function deleteFavorite(favoriteId) {
  if (!confirm("Sigur vrei să ștergi acest loc favorit?")) return;

  const user = getUser();
  const favorite = favoritesSystem.favorites.find((f) => f.id == favoriteId);
  if (!favorite) return;

  if (user) {
    //autentificat - sterge din bd
    try {
      const response = await fetch(
        `favorites_api.php?action=delete&id=${favoriteId}`,
        {
          method: "DELETE",
        },
      );
      const data = await response.json();

      if (data.success) {
        favoritesSystem.favorites = favoritesSystem.favorites.filter(
          (f) => f.id != favoriteId,
        );
        renderFavoritesList();
        removeFavoriteMarker(favoriteId);
        showFavoritesMessage("Loc șters", "success");
      } else {
        showFavoritesMessage("Eroare la ștergere", "error");
      }
    } catch (error) {
      console.error("Eroare la ștergere:", error);
      showFavoritesMessage("Eroare la ștergere", "error");
    }
  } else {
    //guest - sterge din localStorage
    favoritesSystem.favorites = favoritesSystem.favorites.filter(
      (f) => f.id != favoriteId,
    );
    saveFavorites();
    renderFavoritesList();
    removeFavoriteMarker(favoriteId);
    showFavoritesMessage("Loc șters", "success");
  }
}

function addFavoriteMarker(favorite) {
  const map = getMap();
  if (!map) return;

  const marker = createMarker(favorite.lat, favorite.lng, "user");
  marker.bindPopup(`
    <div style="min-width: 180px;">
      <h4 style="margin: 0 0 5px 0;">${getCategoryIcon(favorite.category)} ${
        favorite.name
      }</h4>
      <p style="margin: 0; font-size: 11px;">${favorite.address}</p>
    </div>
  `);
  favoriteMarkers[favorite.id] = marker;
}

function removeFavoriteMarker(favoriteId) {
  if (favoriteMarkers[favoriteId]) {
    getMap().removeLayer(favoriteMarkers[favoriteId]);
    delete favoriteMarkers[favoriteId];
  }
}

function getCategoryName(category) {
  const names = { favorite: "Favorit", home: "Acasă", work: "Muncă" };
  return names[category] || category;
}

function getCategoryIcon(category) {
  const icons = { favorite: "⭐", home: "🏠", work: "💼" };
  return icons[category] || "📍";
}

function showFavoritesMessage(message, type = "info") {
  const messageEl = document.getElementById("favoritesMessage");
  if (!messageEl) return;

  messageEl.textContent = message;
  messageEl.style.display = "block";
  messageEl.style.background =
    type === "success" ? "#d4edda" : type === "error" ? "#f8d7da" : "#d1ecf1";
  messageEl.style.color =
    type === "success" ? "#155724" : type === "error" ? "#721c24" : "#0c5460";
  messageEl.style.border =
    type === "success"
      ? "1px solid #c3e6cb"
      : type === "error"
        ? "1px solid #f5c6cb"
        : "1px solid #bee5eb";

  setTimeout(() => (messageEl.style.display = "none"), 3000);
}

//functiile global pentru onclick
window.navigateToFavorite = navigateToFavorite;
window.useFavoriteInRouting = useFavoriteInRouting;
window.deleteFavorite = deleteFavorite;

export {
  syncFavoritesOnLogin,
  syncFavoritesOnLogout,
  loadUserFavoritesFromDB,
  refreshFavoritesOnMap,
  clearAllFavoriteMarkers,
};
