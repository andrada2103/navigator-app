// weather/meteo-api.js - DOAR funcțiile API pentru integrare

const API_GEOLOCATION_URL = "https://geocoding-api.open-meteo.com/v1/search";
const API_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

async function getCityCoordinates(cityName) {
  const apiUrl = new URL(API_GEOLOCATION_URL);
  apiUrl.searchParams.append("name", cityName);
  apiUrl.searchParams.append("count", 1);

  const response = await fetch(apiUrl.toString());
  const data = await response.json();

  if (!data || !data.hasOwnProperty("results")) {
    return null;
  }

  const result = data.results[0];
  return { lat: result.latitude, long: result.longitude };
}

async function getWeather(lat, long) {
  const apiUrl = new URL(API_FORECAST_URL);
  apiUrl.searchParams.append("latitude", lat);
  apiUrl.searchParams.append("longitude", long);
  apiUrl.searchParams.append("timezone", "auto");
  apiUrl.searchParams.append(
    "hourly",
    "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
  );

  const response = await fetch(apiUrl.toString());
  const data = await response.json();
  return data;
}

function parseApiData(data) {
  const numberOfItems = data.hourly.time.length;
  let currentWeather = null;

  const currentDateTime = new Date();
  for (let i = 0; i < numberOfItems; i++) {
    const itemDateTime = new Date(data.hourly.time[i]);
    const isCurrentHour =
      currentDateTime.getHours() === itemDateTime.getHours();

    if (isCurrentHour) {
      currentWeather = {
        date: data.hourly.time[i],
        temp: data.hourly.temperature_2m[i],
        wind: data.hourly.wind_speed_10m[i],
        humidity: data.hourly.relative_humidity_2m[i],
        code: data.hourly.weather_code[i],
      };
      break;
    }
  }

  return {
    current: currentWeather,
  };
}

function getIcon(code, isNight) {
  switch (code) {
    case 0:
      return isNight ? "🌙" : "☀️";
    case 1:
    case 2:
    case 3:
      return isNight ? "🌤️" : "⛅";
    case 45:
    case 48:
      return "🌫️";
    case 51:
    case 53:
    case 55:
      return "🌦️";
    case 61:
    case 63:
    case 65:
      return "🌧️";
    case 71:
    case 73:
    case 75:
      return "❄️";
    case 95:
    case 96:
    case 99:
      return "⛈️";
    default:
      return isNight ? "🌙" : "☀️";
  }
}

function isNight() {
  const currentHour = new Date().getHours();
  return currentHour >= 20 || currentHour <= 6;
}

function getWeatherDescription(code) {
  const descriptions = {
    0: "Senin",
    1: "Parțial senin",
    2: "Parțial noros",
    3: "Noros",
    45: "Ceață",
    48: "Ceață înghețată",
    51: "Burniță ușoară",
    53: "Burniță moderată",
    55: "Burniță densă",
    61: "Ploaie ușoară",
    63: "Ploaie moderată",
    65: "Ploaie puternică",
    71: "Ninsori ușoare",
    73: "Ninsori moderate",
    75: "Ninsori puternice",
    80: "Averse ușoare",
    81: "Averse moderate",
    82: "Averse violente",
    95: "Furtună",
    96: "Furtună cu grindină",
    99: "Furtună puternică",
  };
  return descriptions[code] || "Condiții necunoscute";
}

//export pentru integrare
window.meteoAPI = {
  getCityCoordinates,
  getWeather,
  parseApiData,
  getIcon,
  isNight,
  getWeatherDescription,

  getExtendedWeather: async function (lat, long) {
    const apiUrl = new URL("https://api.open-meteo.com/v1/forecast");
    apiUrl.searchParams.append("latitude", lat);
    apiUrl.searchParams.append("longitude", long);
    apiUrl.searchParams.append("timezone", "auto");
    apiUrl.searchParams.append(
      "hourly",
      "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation_probability",
    );
    apiUrl.searchParams.append(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    );
    apiUrl.searchParams.append(
      "current",
      "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation",
    );

    const response = await fetch(apiUrl.toString());
    const data = await response.json();
    return data;
  },

  searchCities: async function (query) {
    const apiUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    apiUrl.searchParams.append("name", query);
    apiUrl.searchParams.append("count", 5);
    apiUrl.searchParams.append("language", "ro");

    const response = await fetch(apiUrl.toString());
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      return data.results.map((city) => ({
        name: city.name,
        lat: city.latitude,
        lng: city.longitude,
        country: city.country,
        admin1: city.admin1,
      }));
    }
    return [];
  },

  getDayName: function (dateString, index) {
    if (index === 0) return "Azi";
    if (index === 1) return "Mâine";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ro-RO", { weekday: "long" }).format(date);
  },
};
