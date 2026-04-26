//functii utilitare
//afiseaza un mesaj tip toast in partea de sus a ecranului
//mesajele sunt afisate timp de 1.5 sec si se elimina automat
//daca exista mesaj - este inlocuit
export function showMessage(message, type = "info") {
  //elimina mesajele existente pentru a nu se suprapune
  const existingMessages = document.querySelectorAll(".message-toast");
  existingMessages.forEach((msg) => msg.remove());

  const toast = document.createElement("div");
  toast.className = "message-toast";
  toast.textContent = message;

  const styles = {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "12px 20px",
    borderRadius: "4px",
    zIndex: "10000",
    fontSize: "14px",
    fontWeight: "bold",
    textAlign: "center",
    minWidth: "300px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  };

  if (type === "error") {
    styles.background = "#f44336";
    styles.color = "white";
  } else if (type === "success") {
    styles.background = "#4CAF50";
    styles.color = "white";
  } else {
    styles.background = "#2196F3";
    styles.color = "white";
  }

  Object.assign(toast.style, styles);
  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 1500);
}

//calculeaza distanta in linie dreapta intre 2 puncte geografice
//foloseste formula haversine care ia in considerare curbura Pamantului
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

//formateaza o distanta pentru afisare in UI
//<1km - afiseaza in metri, >1km afiseaza in km
export function formatDistance(distance) {
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }
  return `${distance.toFixed(1)} km`;
}

//intarzie executia unei functii pana cand nu mai sunt apeluri pentru o perioada
//folosit pentru a reduce numarul de cereri api in timpul testarii
//exp: daca utilizatorul tasteaza "brasov", functia se va apela o singura data dupa ce a stat 400ms fara sa tasteze
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
