//sistem meteo
//afiseaza vremea folosind api-ul open-meteo
//popup cu vreme curenta la cautare locatie
//modal detaliat cu vremea pe 7 zile
//grafic cu evolutia temperaturii pe 24 ore
//prognoza orara si zilnica
import { trackWeather } from "./history.js";

let myWeatherChartInstance = null;
let currentDetailedWeather = null;

//initializare
export function initWeatherSystem() {
  initIntegratedWeather();
}

//configureaza evenimentele pentru butonul si modalul meteo
function initIntegratedWeather() {
  const sidebarWeatherBtn = document.getElementById("sidebarWeatherBtn");
  const weatherModal = document.getElementById("weatherModal");

  if (!sidebarWeatherBtn || !weatherModal) return;

  const closeBtn = weatherModal.querySelector(".close");

  sidebarWeatherBtn.addEventListener("click", () => {
    showDetailedWeatherModal();
  });

  closeBtn.addEventListener("click", () => {
    weatherModal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === weatherModal) weatherModal.style.display = "none";
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && weatherModal.style.display === "block") {
      weatherModal.style.display = "none";
    }
  });
}

//afiseaza un popup cu vremea curenta pentru o locatie
//folosit in search.js cand utilizatorul selecteaza o locatie
export async function showWeatherInPopup(lat, lng, locationName) {
  try {
    if (!window.meteoAPI || !window.meteoAPI.getWeather) return null;

    const weatherResponse = await window.meteoAPI.getWeather(lat, lng);
    const weatherData = window.meteoAPI.parseApiData(weatherResponse);
    const current = weatherData.current;

    if (!current) return null;

    const isCurrentlyNight = window.meteoAPI.isNight();
    const weatherIcon = window.meteoAPI.getIcon(current.code, isCurrentlyNight);
    const weatherDesc = window.meteoAPI.getWeatherDescription(current.code);

    return `
      <div style="min-width: 220px; padding: 10px;">
        <h4 style="margin: 0 0 8px 0; font-size: 14px;">${locationName}</h4>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 20px;">${weatherIcon}</span>
          <div style="font-size: 18px; font-weight: bold;">${Math.round(
            current.temp,
          )}°C</div>
        </div>
        <div style="font-size: 11px; color: #555; line-height: 1.3;">
          <div>💨 ${current.wind} km/h</div>
          <div>💧 ${current.humidity}%</div>
          <div>${weatherDesc}</div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Eroare vreme popup:", error);
    return null;
  }
}

//afiseaza modalul detaliat cu vremea
//utilizatorul poate cauta un oras pentru a vedea prognoza
function showDetailedWeatherModal() {
  const weatherModal = document.getElementById("weatherModal");
  const weatherContent = document.getElementById("weatherContent");

  weatherModal.style.display = "block";
  weatherContent.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="margin-bottom: 15px; text-align: center; margin-top: 0px">Vreme</h3>
      <div style="margin-bottom: 15px;">
        <input type="text" id="weatherSearchInput" placeholder="Caută oraș..." 
               style="width: 100%; padding: 10px; border: 1px solid rgba(0, 0, 0, 0.405); border-radius: 5px; font-size: 14px;">
      </div>
      <div id="detailedWeatherResults" style="min-height: 200px;">
        <p style="text-align: center; color: #666; font-size: 14px;">
          Caută un oraș pentru a vedea vremea
        </p>
      </div>
    </div>
  `;

  const searchInput = document.getElementById("weatherSearchInput");
  let searchTimeout;

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (searchInput.value.length >= 2) {
        searchCityForDetailedWeather(searchInput.value);
      } else {
        document.getElementById("detailedWeatherResults").innerHTML =
          '<p style="text-align: center; color: #666; font-size: 14px;">Caută un oraș pentru a vedea vremea</p>';
      }
    }, 500);
  });

  searchInput.focus();
}

//cauta orase folosind api-ul de geocoding
async function searchCityForDetailedWeather(query) {
  const resultsDiv = document.getElementById("detailedWeatherResults");
  resultsDiv.innerHTML =
    '<p style="text-align: center; font-size: 14px;">Se caută...</p>';

  try {
    const cities = await window.meteoAPI.searchCities(query);

    if (cities && cities.length > 0) {
      let html =
        '<div style="max-height: 150px; overflow-y: auto; margin-bottom: 15px;">';
      cities.forEach((city) => {
        const displayName = city.admin1
          ? `${city.name}, ${city.admin1}`
          : city.name;
        html += `
          <div class="city-result" data-lat="${city.lat}" data-lng="${
            city.lng
          }" data-name="${displayName}"
               style="padding: 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.405); cursor: pointer; font-size: 14px;">
            <strong>${displayName}</strong>
            <div style="font-size: 12px; color: #666;">${
              city.country || ""
            }</div>
          </div>
        `;
      });
      html += "</div>";
      resultsDiv.innerHTML = html;

      document.querySelectorAll(".city-result").forEach((item) => {
        item.addEventListener("click", async () => {
          const lat = parseFloat(item.getAttribute("data-lat"));
          const lng = parseFloat(item.getAttribute("data-lng"));
          const name = item.getAttribute("data-name");
          await loadDetailedWeather(lat, lng, name);
        });
      });
    } else {
      resultsDiv.innerHTML =
        '<p style="text-align: center; color: #666; font-size: 14px;">Nu s-au găsit rezultate</p>';
    }
  } catch (error) {
    console.error("Eroare căutare oraș:", error);
    resultsDiv.innerHTML =
      '<p style="text-align: center; color: red; font-size: 14px;">Eroare la căutare</p>';
  }
}

//incarca datele meteo detaliate pentru un oras
async function loadDetailedWeather(lat, lng, cityName) {
  const resultsDiv = document.getElementById("detailedWeatherResults");
  resultsDiv.innerHTML =
    '<p style="text-align: center; font-size: 14px;">Se încarcă datele meteo...</p>';

  try {
    const weatherResponse = await window.meteoAPI.getExtendedWeather(lat, lng);
    const weatherData = window.meteoAPI.parseApiData(weatherResponse);

    currentDetailedWeather = {
      city: cityName,
      coords: { lat, lng },
      data: weatherData,
      extendedData: weatherResponse,
    };

    displayDetailedWeather(weatherData, weatherResponse, cityName, lat, lng);
  } catch (error) {
    console.error("Eroare încărcare vreme:", error);
    resultsDiv.innerHTML =
      '<p style="text-align: center; color: red; font-size: 14px;">Eroare la încărcarea vremii</p>';
  }
}

//afiseaza datele meteo detaliate in UI
//include vremea, prognoza orara, grafic temperatura, prognoza zilnica
function displayDetailedWeather(weatherData, extendedData, cityName, lat, lng) {
  const resultsDiv = document.getElementById("detailedWeatherResults");
  const current = weatherData.current;

  //verifica daca exista datele
  if (!current) {
    resultsDiv.innerHTML =
      '<p style="text-align: center; color: red; font-size: 14px;">Date meteo indisponibile</p>';
    return;
  }

  const isCurrentlyNight = window.meteoAPI.isNight();
  const weatherIcon = window.meteoAPI.getIcon(current.code, isCurrentlyNight);
  const weatherDesc = window.meteoAPI.getWeatherDescription(current.code);
  const feelsLike = calculateFeelsLike(
    current.temp,
    current.wind,
    current.humidity,
  );
  const precipitation = extendedData.current?.precipitation || 0;
  const precipProb = extendedData.hourly?.precipitation_probability?.[0] || 0;
  const uvIndex = getUVIndex();

  //salveaza in istoric
  if (typeof trackWeather === "function") {
    trackWeather(cityName, lat, lng, current.temp, weatherDesc);
  }

  resultsDiv.innerHTML = `
    <div class="detailed-weather">
      <div style="text-align: center; margin-bottom: 20px; padding: 15px; background: linear-gradient(145deg,#141814,#3c4a3e, #5e7561); border-radius: 10px; color: white;">
        <h3 style="margin: 0 0 10px 0; font-size: 18px;">${cityName}</h3>
        <div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 10px;">
          <div style="font-size: 48px;">${weatherIcon}</div>
          <div>
            <div style="font-size: 36px; font-weight: bold;">${Math.round(
              current.temp,
            )}°C</div>
            <div style="font-size: 16px; opacity: 0.9;">${weatherDesc}</div>
          </div>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
        <div style="background: rgba(0,0,0,0.03); padding: 12px; border-radius: 8px;">
          <div style="font-size: 12px; color: #666;">💨 Vânt</div>
          <div style="font-size: 18px; font-weight: bold;">${
            current.wind
          } km/h</div>
        </div>
        <div style="background: rgba(0,0,0,0.03); padding: 12px; border-radius: 8px;">
          <div style="font-size: 12px; color: #666;">💧 Umiditate</div>
          <div style="font-size: 18px; font-weight: bold;">${
            current.humidity
          }%</div>
        </div>
        <div style="background: rgba(0,0,0,0.03); padding: 12px; border-radius: 8px;">
          <div style="font-size: 12px; color: #666;">🌡️ Simțit ca</div>
          <div style="font-size: 18px; font-weight: bold;">${feelsLike}°C</div>
        </div>
        <div style="background: rgba(0,0,0,0.03); padding: 12px; border-radius: 8px;">
          <div style="font-size: 12px; color: #666;">💦 Precipitații</div>
          <div style="font-size: 18px; font-weight: bold;">${precipitation} mm</div>
        </div>
      </div>
      
      <div style="background: rgba(0,0,0,0.03); padding: 12px; border-radius: 8px; margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 14px; font-weight: bold;">📊 Probabilitate precipitații</span>
          <span style="font-size: 16px; font-weight: bold; color: #4e5044;">${precipProb}%</span>
        </div>
        <div style="background: #fff; height: 8px; border-radius: 4px; overflow: hidden;">
          <div style="background: linear-gradient(90deg, #cccfc9, #a3a990); height: 100%; width: ${precipProb}%;"></div>
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 12px 0; font-size: 16px;">🕒 Următoarele ore</h4>
        <div id="hourlyForecast" style="display: flex; gap: 10px; overflow-x: auto; padding: 10px 0;"></div>
      </div>
      
      <div style="background: linear-gradient(90deg, #4CAF50, #FFC107, #F44336); padding: 12px; border-radius: 8px; text-align: center; color: white;">
        <div style="font-size: 12px;">☀️ Index UV</div>
        <div style="font-size: 16px; font-weight: bold;">${uvIndex.value} (${
          uvIndex.level
        })</div>
      </div>
      
      <div style="position: relative; height: 200px; width: 100%; margin: 20px 0; background: rgba(0,0,0,0.03); padding: 10px; border-radius: 10px;">
        <h4 style="margin: 0 0 5px 0; font-size: 14px; color: #4e5044;">🌡️ Evoluția temperaturii (24h)</h4>
        <canvas id="temperatureChart"></canvas>
      </div>

      <div style="margin-top: 20px; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 15px;">
        <h4 style="margin: 0 0 12px 0; font-size: 16px;">📅 Zilele următoare</h4>
        <div id="dailyForecastList" style="display: flex; flex-direction: column; gap: 8px;"></div>
      </div>
    </div>
  `;

  setTimeout(() => createTemperatureChart(extendedData), 100);
  loadHourlyForecast(extendedData);
  loadDailyForecast(extendedData);
}

//functii helper
//calculeaza senzatia termica aproximativa
//formula simplificata, nu stiintifica
function calculateFeelsLike(temp, wind, humidity) {
  let feelsLike = temp;
  if (temp < 10 && wind > 5) feelsLike = temp - wind * 0.7;
  if (temp > 20 && humidity > 70) feelsLike = temp + humidity * 0.1;
  return Math.round(feelsLike);
}

//estimeaza indexul UV pe baza orei si lunii
//nu foloseste api, este aproximare
function getUVIndex() {
  const hour = new Date().getHours();
  const month = new Date().getMonth();
  let value, level;

  if (month >= 4 && month <= 8) {
    //vara
    if (hour >= 11 && hour <= 15) {
      value = "7-9";
      level = "Ridicat";
    } else if (hour >= 9 && hour <= 17) {
      value = "5-7";
      level = "Moderat";
    } else {
      value = "2-4";
      level = "Scăzut";
    }
  } else {
    //iarna
    if (hour >= 11 && hour <= 14) {
      value = "3-5";
      level = "Moderat";
    } else {
      value = "1-3";
      level = "Scăzut";
    }
  }
  return { value, level };
}

//creeaza graficul cu evolutia temperaturii pe 24h
//foloseste chart.js
function createTemperatureChart(extendedData) {
  const ctx = document.getElementById("temperatureChart")?.getContext("2d");
  if (!ctx) return;

  if (myWeatherChartInstance) myWeatherChartInstance.destroy();

  const labels = extendedData.hourly.time
    .slice(0, 24)
    .map((t) => new Date(t).getHours() + ":00");
  const temps = extendedData.hourly.temperature_2m.slice(0, 24);

  myWeatherChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Temperatură (°C)",
          data: temps,
          borderColor: "#4e5044",
          backgroundColor: "rgba(78, 80, 68, 0.1)",
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: "#4e5044",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          display: true,
          grid: { display: false },
          ticks: { callback: (v) => v + "°" },
        },
        x: {
          display: true,
          grid: { display: false },
          ticks: { maxTicksLimit: 8 },
        },
      },
    },
  });
}

//incarca si afiseaza prognoza orara pentru 24h
function loadHourlyForecast(extendedData, customStartIndex = null) {
  const hourlyContainer = document.getElementById("hourlyForecast");
  if (!extendedData.hourly || !hourlyContainer) return;

  let startIndex = customStartIndex;
  if (startIndex === null) {
    const now = new Date();
    const currentHour = now.getHours();
    const startTime = new Date(now);
    startTime.setHours(currentHour, 0, 0, 0);

    for (let i = 0; i < extendedData.hourly.time.length; i++) {
      if (new Date(extendedData.hourly.time[i]) >= startTime) {
        startIndex = i;
        break;
      }
    }
  }

  let html = "";
  for (let i = 0; i < 24; i++) {
    const idx = startIndex + i;
    if (idx >= extendedData.hourly.time.length) break;

    const hourTime = new Date(extendedData.hourly.time[idx]);
    const hourStr = hourTime.getHours().toString().padStart(2, "0") + ":00";
    const dayNames = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"];
    const dayLabel = dayNames[hourTime.getDay()];
    const temp = Math.round(extendedData.hourly.temperature_2m[idx]);
    const code = extendedData.hourly.weather_code[idx];
    const precipProb =
      extendedData.hourly.precipitation_probability?.[idx] || 0;
    const isNight = hourTime.getHours() >= 20 || hourTime.getHours() <= 6;
    const icon = window.meteoAPI.getIcon(code, isNight);

    html += `
      <div style="text-align: center; padding: 10px; border-radius: 8px; min-width: 75px; 
                  box-shadow: 0 2px 4px rgba(0,0,0,0.1); background: linear-gradient(#cccfc9, #a3a990);">
        <div style="font-size: 10px; color: #666;">${dayLabel}</div>
        <div style="font-size: 12px; font-weight: bold;">${hourStr}</div>
        <div style="font-size: 24px;">${icon}</div>
        <div style="font-size: 14px; font-weight: bold;">${temp}°C</div>
        <div style="font-size: 10px; color: ${
          precipProb > 60 ? "#F44336" : precipProb > 30 ? "#FF9800" : "#666"
        };">${precipProb}% 💦</div>
      </div>
    `;
  }
  hourlyContainer.innerHTML = html;
}

//incarca si afiseaza prognoza zilnica pentru 7 zile
//la click pe o zi reincarca prognoza orara pentru acea zi
function loadDailyForecast(extendedData) {
  const dailyContainer = document.getElementById("dailyForecastList");
  if (!extendedData.daily || !dailyContainer) return;

  let html = "";
  const daily = extendedData.daily;

  for (let i = 0; i < daily.time.length; i++) {
    const dayName = window.meteoAPI.getDayName(daily.time[i], i);
    const icon = window.meteoAPI.getIcon(daily.weather_code[i], false);
    const maxTemp = Math.round(daily.temperature_2m_max[i]);
    const minTemp = Math.round(daily.temperature_2m_min[i]);
    const rainProb = daily.precipitation_probability_max[i];

    html += `
      <div class="daily-row" data-day-index="${i}" 
           style="display: flex; align-items: center; justify-content: space-between; padding: 10px; 
                  background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px solid rgba(0,0,0,0.05); 
                  cursor: pointer; transition: background 0.2s;">
        <span style="width: 80px; font-weight: bold; text-transform: capitalize; font-size: 13px;">${dayName}</span>
        <span style="font-size: 20px; flex: 1; text-align: center;">${icon}</span>
        <div style="width: 90px; text-align: right; font-size: 13px;">
          <span style="font-weight: bold;">${maxTemp}°</span> / <span style="color: #666;">${minTemp}°</span>
        </div>
        <div style="width: 50px; text-align: right; color: #4A90E2; font-size: 11px; font-weight: bold;">
          ${rainProb}% 💧
        </div>
      </div>
    `;
  }
  dailyContainer.innerHTML = html;

  document.querySelectorAll(".daily-row").forEach((row) => {
    row.addEventListener("click", function () {
      const dayIndex = parseInt(this.getAttribute("data-day-index"));
      const startIdx = dayIndex * 24;
      loadHourlyForecast(extendedData, startIdx);

      document
        .querySelectorAll(".daily-row")
        .forEach((r) => (r.style.background = "rgba(0,0,0,0.03)"));
      this.style.background = "rgba(0,0,0,0.1)";

      if (myWeatherChartInstance) {
        const newLabels = extendedData.hourly.time
          .slice(startIdx, startIdx + 24)
          .map((t) => new Date(t).getHours() + ":00");
        const newTemps = extendedData.hourly.temperature_2m.slice(
          startIdx,
          startIdx + 24,
        );
        myWeatherChartInstance.data.labels = newLabels;
        myWeatherChartInstance.data.datasets[0].data = newTemps;
        myWeatherChartInstance.update();
      }
    });
  });
}
