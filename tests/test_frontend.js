//de rulat în consola browser-ului sau cu Node.js

console.log("Test frontend\n");

let passed = 0;
let failed = 0;

function runTest(name, condition) {
  if (condition) {
    console.log(`Pass: ${name}`);
    passed++;
  } else {
    console.log(`Fail: ${name}`);
    failed++;
  }
}

// Test 3.1: Calcul distanță între două puncte
function calculateDistance(lat1, lng1, lat2, lng2) {
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

runTest(
  "calculateDistance() - același punct = 0",
  calculateDistance(45.65, 25.6, 45.65, 25.6) === 0,
);

const dist = calculateDistance(45.65, 25.6, 45.66, 25.61);
runTest(
  "calculateDistance() - puncte apropiate (1-2 km)",
  dist > 1.0 && dist < 2.0,
);

// Test 3.2: Formatare distanță
function formatDistance(distance) {
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }
  return `${distance.toFixed(1)} km`;
}

runTest("formatDistance() - sub 1 km (500m)", formatDistance(0.5) === "500 m");
runTest(
  "formatDistance() - peste 1 km (2.5km)",
  formatDistance(2.5) === "2.5 km",
);

// Test 3.3: Validare coordonate
function validateCoordinates(lat, lng) {
  return (
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

runTest(
  "validateCoordinates() - coordonate valide",
  validateCoordinates(45.65, 25.6) === true,
);
runTest(
  "validateCoordinates() - latitudine invalidă (>90)",
  validateCoordinates(100, 25.6) === false,
);
runTest(
  "validateCoordinates() - longitudine invalidă",
  validateCoordinates(45.65, 200) === false,
);
runTest(
  "validateCoordinates() - NaN",
  validateCoordinates(NaN, 25.6) === false,
);

// Test 3.4: Sanitizare input (prevenire XSS)
function sanitizeInput(data) {
  if (typeof data !== "string") return data;
  return data.replace(/[&<>]/g, function (m) {
    if (m === "&") return "&amp;";
    if (m === "<") return "&lt;";
    if (m === ">") return "&gt;";
    return m;
  });
}

runTest(
  "sanitizeInput() - elimină <tag>",
  sanitizeInput("<script>") === "&lt;script&gt;",
);
runTest(
  "sanitizeInput() - păstrează text normal",
  sanitizeInput("text normal") === "text normal",
);

console.log(`Trecute: ${passed}`);
console.log(`Eșuate: ${failed}`);
console.log(`Total: ${passed + failed}`);
