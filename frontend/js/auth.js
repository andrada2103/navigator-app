//sistem autentificare
import { showMessage } from "../core/utils.js";
import { syncFavoritesOnLogout } from "./favorites.js";

let currentUser = null;

//initializare
export function initAuth() {
  const authBtn = document.getElementById("authBtn");
  const authModal = document.getElementById("authModal");
  const authClose = document.querySelector(".auth-close");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const logoutBtn = document.getElementById("logoutBtn");

  checkExistingAuth();

  if (!authBtn || !authModal) return;

  //butonul de autentificare
  authBtn.addEventListener("click", () => {
    if (currentUser) {
      authModal.style.display = "block";
      document.querySelector("#authTabs").style.display = "none";
      document.getElementById("loginForm").classList.remove("active");
      document.getElementById("registerForm").classList.remove("active");
      if (logoutBtn) logoutBtn.style.display = "block";
    } else {
      authModal.style.display = "block";
      document.querySelector("#authTabs").style.display = "flex";
      document.getElementById("loginForm").classList.add("active");
      document.getElementById("registerForm").classList.remove("active");
      if (logoutBtn) logoutBtn.style.display = "none";
    }
  });

  if (authClose) {
    authClose.addEventListener("click", () => {
      authModal.style.display = "none";
    });
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      switchAuthTab(tab);
    });
  });

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await handleLogin();
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await handleRegister();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    });
  }
}

//comuta intre login si register
function switchAuthTab(tab) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document
    .querySelectorAll(".auth-form")
    .forEach((form) => form.classList.remove("active"));

  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");
  document.getElementById(`${tab}Form`).classList.add("active");

  const titleEl = document.getElementById("authModalTitle");
  if (titleEl) {
    titleEl.textContent = tab === "login" ? "Autentificare" : "Înregistrare";
  }
}

//sincronizeaza datele din localStorage si baza de date - istoric + favorite
async function syncLocalDataWithDB(userId) {
  //sincronizare istoric
  try {
    const guestHistory = localStorage.getItem("guestHistory");
    if (guestHistory) {
      const history = JSON.parse(guestHistory);
      if (history.length > 0) {
        const syncResponse = await fetch("history_api.php?action=sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ history: history }),
        });
        const syncData = await syncResponse.json();
        if (syncData.success) {
          localStorage.removeItem("guestHistory");
        }
      }
    }
  } catch (syncError) {
    console.error("Eroare la sincronizarea istoricului:", syncError);
  }

  //sincronizare favorite
  try {
    const favoritesModule = await import("./favorites.js");
    const guestFavorites = localStorage.getItem("userFavorites");

    if (guestFavorites) {
      const favorites = JSON.parse(guestFavorites);
      if (favorites.length > 0) {
        const syncResponse = await fetch("favorites_api.php?action=sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ favorites: favorites }),
        });
        const syncData = await syncResponse.json();
        if (syncData.success) {
          localStorage.removeItem("userFavorites");
        }
      }
    }

    await favoritesModule.loadUserFavoritesFromDB(userId);
  } catch (favError) {
    console.error("Eroare la sincronizarea favorite:", favError);
  }
}

//autentificare utilizator
async function handleLogin() {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    showAuthMessage("Completează toate câmpurile", "error");
    return;
  }

  try {
    const response = await fetch("auth.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email, password }),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      showAuthMessage("Eroare server", "error");
      return;
    }

    if (data.success) {
      currentUser = data.user;

      //sincronizează date localStorage cu BD
      await syncLocalDataWithDB(currentUser.id);

      document.dispatchEvent(new CustomEvent("auth:login"));
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      updateAuthUI();
      showAuthMessage("Autentificare reușită!", "success");

      import("./history.js").then((module) => {
        module.userHistory.loadFromStorage();
      });

      setTimeout(() => {
        const authModal = document.getElementById("authModal");
        const loginForm = document.getElementById("loginForm");
        if (authModal) authModal.style.display = "none";
        if (loginForm) loginForm.reset();
      }, 1500);
    } else {
      showAuthMessage(data.message, "error");
    }
  } catch (error) {
    showAuthMessage("Eroare de conexiune", "error");
  }
}

//inregistrare utilizator nou
async function handleRegister() {
  const name = document.getElementById("registerName").value;
  const email = document.getElementById("registerEmail").value;
  const password = document.getElementById("registerPassword").value;

  if (!email || !password) {
    showAuthMessage("Completează email și parolă", "error");
    return;
  }

  try {
    const response = await fetch("auth.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "register", email, password, name }),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      showAuthMessage("Eroare server", "error");
      return;
    }

    if (data.success) {
      showAuthMessage(
        "Înregistrare reușită! Te poți autentifica acum.",
        "success",
      );
      setTimeout(() => {
        switchAuthTab("login");
        const emailField = document.getElementById("loginEmail");
        const registerForm = document.getElementById("registerForm");
        if (emailField) emailField.value = email;
        if (registerForm) registerForm.reset();
      }, 1500);
    } else {
      showAuthMessage(data.message, "error");
    }
  } catch (error) {
    showAuthMessage("Eroare de conexiune", "error");
  }
}

///verifica daca exista sesiune salvata in localStorage
function checkExistingAuth() {
  const savedUser = localStorage.getItem("currentUser");
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      updateAuthUI();
    } catch (e) {
      localStorage.removeItem("currentUser");
    }
  }
}

//actualizeaza interfata in functie de starea autentificarii.
function updateAuthUI() {
  const authBtn = document.getElementById("authBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (!authBtn) return;

  if (currentUser) {
    authBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="sidebar-icon">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
      <span>${currentUser.name || currentUser.email.split("@")[0]}</span>
    `;
    authBtn.title = "Contul meu";
    if (logoutBtn) logoutBtn.style.display = "block";
  } else {
    authBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="sidebar-icon">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
      <span>Autentificare</span>
    `;
    authBtn.title = "Autentificare/Înregistrare";
    if (logoutBtn) logoutBtn.style.display = "none";
  }
}

//afiseaza un mesaj in modal-ul de autentificare.
function showAuthMessage(message, type) {
  const messageEl = document.getElementById("authMessage");
  if (!messageEl) return;

  messageEl.textContent = message;
  messageEl.className = `auth-message ${type}`;
  messageEl.style.display = "block";
  setTimeout(() => (messageEl.style.display = "none"), 5000);
}

//deconectare
export async function logout() {
  await syncFavoritesOnLogout();

  currentUser = null;
  localStorage.removeItem("currentUser");
  updateAuthUI();

  const authModal = document.getElementById("authModal");
  if (authModal) authModal.style.display = "none";

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.style.display = "none";

  const authTabs = document.querySelector("#authTabs");
  if (authTabs) authTabs.style.display = "flex";

  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.classList.add("active");

  showMessage("Te-ai deconectat", "success");
}

//returneaza utilizatorul curent
export function getUser() {
  return currentUser;
}
