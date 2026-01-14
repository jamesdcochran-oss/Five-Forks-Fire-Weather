// Five Forks Fire Weather Dashboard - Hardened Main JavaScript
// Goals: stable UI, fail-soft network calls, correct NWS endpoint, optional FIRMS

const CONFIG = {
  fiveForks: { lat: 36.8, lon: -79.1, name: "Five Forks District" },

  // ✅ Use forecast endpoint (has periods[])
  nwsForecast: "https://api.weather.gov/gridpoints/RNK/58,60/forecast",

  // Keep your forecast embed if you like; treat it as optional.
  forecastURL:
    "https://raw.githubusercontent.com/jamesdcochran-oss/Virginia-2025-Fall-Fire-Season/main/forecasts/current-forecast.html",

  // FIRMS can be flaky in-browser; keep it optional & non-blocking
  firmsURL:
    "https://firms.modaps.eosdis.nasa.gov/api/area/csv/c6e1534c1d57bc74f7bd8fa3f7715fd5/VIIRS_SNPP_NRT",

  refreshIntervalMs: 10 * 60 * 1000,
  fetchTimeoutMs: 12_000,
  cacheKeyNws: "fiveforks_cache_nws_forecast_v1",
};

let map = null;
let hotspotLayer = null;

// ---------- utilities ----------
function $(id) {
  return document.getElementById(id);
}

function safeText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function safeHTML(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

function fmtNow() {
  return new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

async function fetchWithTimeout(url, { timeoutMs = CONFIG.fetchTimeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function parseWindMph(windSpeedStr) {
  // NWS often returns "10 to 15 mph" or "15 mph"
  if (!windSpeedStr) return null;
  const m = String(windSpeedStr).match(/(\d+)(?:\s*to\s*(\d+))?/i);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = m[2] ? parseInt(m[2], 10) : null;
  if (Number.isFinite(a) && Number.isFinite(b)) return Math.round((a + b) / 2);
  if (Number.isFinite(a)) return a;
  return null;
}

function showAlert(message) {
  const alert = $("danger-alert");
  if (!alert) return;
  safeText("alert-message", message);
  alert.classList.remove("hidden");
}

function hideAlert() {
  const alert = $("danger-alert");
  if (!alert) return;
  alert.classList.add("hidden");
}

// ---------- init ----------
document.addEventListener("DOMContentLoaded", () => {
  initMapSafe();
  loadAllData();

  setInterval(loadAllData, CONFIG.refreshIntervalMs);

  const btn = $("refresh-map");
  if (btn) btn.addEventListener("click", () => loadFIRMSData());
});

function initMapSafe() {
  // Leaflet might fail to load; don’t crash the whole page if it does.
  if (typeof L === "undefined") {
    console.warn("Leaflet not loaded; map disabled.");
    safeText("hotspot-count", "Map unavailable");
    return;
  }

  map = L.map("map").setView([CONFIG.fiveForks.lat, CONFIG.fiveForks.lon], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(map);

  L.marker([CONFIG.fiveForks.lat, CONFIG.fiveForks.lon])
    .bindPopup("<b>Five Forks District</b>")
    .addTo(map);

  hotspotLayer = L.layerGroup().addTo(map);
}

// ---------- main load ----------
async function loadAllData() {
  safeText("last-update", `Last updated: ${fmtNow()}`);

  // Load NWS + Forecast embed in parallel; FIRMS separate so it never blocks core UI.
  await Promise.allSettled([loadNWSForecast(), loadForecastEmbed()]);
  loadFIRMSData(); // fire and forget (optional)
}

// ---------- forecast embed ----------
async function loadForecastEmbed() {
  try {
    const res = await fetchWithTimeout(CONFIG.forecastURL);
    if (!res.ok) throw new Error(`Forecast embed HTTP ${res.status}`);
    const html = await res.text();
    safeHTML("forecast-container", html);
  } catch (e) {
    console.warn("Forecast embed unavailable:", e);
    safeHTML(
      "forecast-container",
      `<div class="error">Forecast embed unavailable right now.</div>`
    );
  }
}

// ---------- NWS ----------
async function loadNWSForecast() {
  const loading = () => {
    safeText("temp-value", "--°F");
    safeText("humidity-value", "--%");
    safeText("wind-value", "-- mph");
    safeText("wind-direction", "--");
  };

  try {
    const res = await fetchWithTimeout(CONFIG.nwsForecast);
    if (!res.ok) throw new Error(`NWS HTTP ${res.status}`);

    const data = await res.json();
    const periods = data?.properties?.periods;
    if (!Array.isArray(periods) || periods.length === 0) {
      throw new Error("NWS forecast periods missing");
    }

    // cache last good
    localStorage.setItem(CONFIG.cacheKeyNws, JSON.stringify(data));

    renderFromNwsForecast(periods);
  } catch (e) {
    console.warn("NWS fetch failed, trying cache:", e);

    // fallback to cached
    const cached = localStorage.getItem(CONFIG.cacheKeyNws);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        const periods = data?.properties?.periods;
        if (Array.isArray(periods) && periods.length) {
          renderFromNwsForecast(periods, { cached: true });
          return;
        }
      } catch (_) {}
    }

    // final fallback
    loading();
    showAlert("Weather feed unavailable (no cache).");
  }
}

function renderFromNwsForecast(periods, { cached = false } = {}) {
  const current = periods[0];
  const next = periods[1] || null;

  // temperature
  safeText("temp-value", `${current.temperature}°F`);
  $("temp-value")?.classList.remove("loading");

  // humidity (may not be present in some feeds)
  const rh = current.relativeHumidity?.value;
  safeText("humidity-value", rh == null ? "N/A" : `${Math.round(rh)}%`);
  $("humidity-value")?.classList.remove("loading");

  // wind
  const mph = parseWindMph(current.windSpeed);
  safeText("wind-value", mph == null ? "N/A" : `${mph} mph`);
  safeText("wind-direction", current.windDirection || "—");
  $("wind-value")?.classList.remove("loading");

  // detail table
  populateWeatherTable(current, next);

  // fire danger heuristic (still your simple method, just safer)
  calculateFireDanger({
    tempF: current.temperature,
    rh: rh,
    windMph: mph,
    cached,
  });
}

function populateWeatherTable(current, forecast) {
  const tbody = $("weather-table-body");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr><td>Temperature</td><td>${current.temperature}°F</td><td>${
    forecast ? `${forecast.temperature}°F` : "N/A"
  }</td></tr>
    <tr><td>Humidity</td><td>${
      current.relativeHumidity?.value ?? "N/A"
    }%</td><td>${forecast?.relativeHumidity?.value ?? "N/A"}%</td></tr>
    <tr><td>Wind Speed</td><td>${current.windSpeed ?? "N/A"}</td><td>${
    forecast?.windSpeed ?? "N/A"
  }</td></tr>
    <tr><td>Wind Direction</td><td>${
      current.windDirection ?? "N/A"
    }</td><td>${forecast?.windDirection ?? "N/A"}</td></tr>
    <tr><td>Sky Condition</td><td>${current.shortForecast ?? "N/A"}</td><td>${
    forecast?.shortForecast ?? "N/A"
  }</td></tr>
  `;
}

function calculateFireDanger({ tempF, rh, windMph, cached }) {
  hideAlert();

  const t = Number.isFinite(tempF) ? tempF : 70;
  const h = Number.isFinite(rh) ? rh : 50;
  const w = Number.isFinite(windMph) ? windMph : 5;

  let danger = "LOW";
  let dangerClass = "low";
  let description = cached
    ? "Using cached weather data"
    : "Minimal fire danger";

  if ((h < 30 && t > 75 && w > 10) || (h < 20 && w > 15)) {
    danger = "HIGH";
    dangerClass = "high";
    description = cached
      ? "Critical conditions (cached weather)"
      : "Critical fire weather conditions";
    showAlert(
      cached
        ? "High fire danger (using cached weather)"
        : "High fire danger conditions detected"
    );
  } else if ((h < 40 && t > 70) || w > 15) {
    danger = "MODERATE";
    dangerClass = "moderate";
    description = cached ? "Elevated danger (cached weather)" : "Elevated fire danger";
  }

  const dangerEl = $("fire-danger-level");
  if (dangerEl) {
    dangerEl.textContent = danger;
    dangerEl.className = `stat-value fire-danger-${dangerClass}`;
  }
  safeText("fire-danger-text", description);
}

// ---------- FIRMS (optional) ----------
async function loadFIRMSData() {
  // If map isn’t available, just skip FIRMS entirely.
  if (!hotspotLayer || typeof L === "undefined") {
    safeText("hotspot-count", "Hotspots unavailable");
    return;
  }

  try {
    const radiusKm = 50;
    const days = 1;
    const url = `${CONFIG.firmsURL}/${CONFIG.fiveForks.lat},${CONFIG.fiveForks.lon}/${days}/${radiusKm}`;

    const res = await fetchWithTimeout(url, { timeoutMs: 15_000 });
    if (!res.ok) throw new Error(`FIRMS HTTP ${res.status}`);

    const csvText = await res.text();
    const hotspots = parseFirmsCSV(csvText);

    displayHotspots(hotspots);
    safeText(
      "hotspot-count",
      `${hotspots.length} detection${hotspots.length !== 1 ? "s" : ""}`
    );
  } catch (e) {
    console.warn("FIRMS unavailable:", e);
    safeText("hotspot-count", "Hotspots unavailable");
    // do NOT throw; this is optional
  }
}

function parseFirmsCSV(csvText) {
  const lines = String(csvText || "").trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const out = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    if (values.length < headers.length) continue;

    const row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = values[j]?.trim();
    out.push(row);
  }

  return out;
}

function displayHotspots(hotspots) {
  hotspotLayer.clearLayers();
  if (!Array.isArray(hotspots) || hotspots.length === 0) return;

  hotspots.forEach((spot) => {
    const lat = parseFloat(spot.latitude);
    const lon = parseFloat(spot.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const confidence = String(spot.confidence || "nominal").toLowerCase();
    const brightness = spot.bright_ti4 || "N/A";
    const datetime = `${spot.acq_date || ""} ${spot.acq_time || ""}`.trim();

    let color = "#FFA500"; // nominal
    if (confidence === "high") color = "#FF0000";
    else if (confidence === "low") color = "#FFFF00";

    const circle = L.circleMarker([lat, lon], {
      radius: 8,
      fillColor: color,
      color: "#000",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.7,
    });

    circle.bindPopup(`
      <b>Fire Detection</b><br>
      Confidence: ${confidence}<br>
      Brightness: ${brightness}K<br>
      Time: ${datetime || "N/A"}
    `);

    circle.addTo(hotspotLayer);
  });

  // Fit bounds (safe)
  try {
    const bounds = hotspotLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
  } catch (_) {}
}
