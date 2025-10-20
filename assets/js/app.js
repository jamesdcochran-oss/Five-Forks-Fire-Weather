import { SOURCES } from "./sources.js";

const COUNTY_NAMES = ["Amelia","Brunswick","Dinwiddie","Greensville","Nottoway","Prince George"];

const COUNTY_SITES = {
  Amelia: SOURCES.wunderground.amelia,
  Brunswick: null, // optional: add Brodnax/Blackstone anchors
  Dinwiddie: SOURCES.wunderground.dinwiddie,
  Greensville: SOURCES.wunderground.emporia,
  Nottoway: null, // optional: add Burkeville/Blackstone anchors
  "Prince George": SOURCES.wunderground.princeGeorge,
};

const countyListEl = document.getElementById("countyList");
const alertsListEl = document.getElementById("alertsList");

// Theme toggle
const themeToggle = document.getElementById("themeToggle");
const currentTheme = localStorage.getItem("theme") || "light";
document.documentElement.setAttribute("data-theme", currentTheme);
themeToggle.addEventListener("click", () => {
  const t = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("theme", t);
});

// Map init (Leaflet via CDN)
const leafletReady = new Promise((resolve) => {
  const linkCSS = document.createElement("link");
  linkCSS.rel = "stylesheet";
  linkCSS.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(linkCSS);
  const script = document.createElement("script");
  script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  script.onload = () => resolve();
  document.body.appendChild(script);
});

async function initMap() {
  await leafletReady;
  const map = L.map("map", { zoomControl: true }).setView([37.19, -77.64], 8);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  // Load local FeatureCollection (AOI polygon + markers)
  const fc = await fetch("assets/data/counties.geojson").then(r => r.json());
  const markers = [];
  fc.features.forEach(f => {
    if (f.geometry.type === "Point") {
      const [lng, lat] = f.geometry.coordinates;
      const m = L.circleMarker([lat, lng], { radius: 6, color: "#A200FF" })
        .bindPopup(`<strong>${f.properties.title || "Marker"}</strong>`);
      m.addTo(map);
      markers.push(m);
    } else if (f.geometry.type === "Polygon") {
      L.polygon(f.geometry.coordinates, {
        color: "#ff0000",
        weight: 2,
        fillOpacity: 0.1
      }).addTo(map);
    }
  });

  // Thermal hotspot layer (optional placeholder)
  // Replace with your FIRMS GeoJSON asset (assets/data/hotspots.geojson)
  try {
    const hotspots = await fetch("assets/data/hotspots.geojson").then(r => r.json());
    L.geoJSON(hotspots, {
      pointToLayer: (pt, latlng) => L.circleMarker(latlng, {
        radius: 3, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.8
      })
    }).addTo(map);
  } catch {
    // No hotspots asset shipped; safe to skip
  }
}

function renderCountyRow(name, obs) {
  const li = document.createElement("li");
  li.innerHTML = `
    <div class="title">${name}</div>
    <div class="row">
      <span>Temp: ${obs?.temp ?? "--"}°F</span>
      <span>RH: ${obs?.rh ?? "--"}%</span>
      <span>Dew: ${obs?.dew ?? "--"}°F</span>
      <span>Wind: ${obs?.wind ?? "--"} mph</span>
      <span>Gust: ${obs?.gust ?? "--"} mph</span>
    </div>
  `;
  countyListEl.appendChild(li);
}

async function fetchNwsAlerts() {
  try {
    const res = await fetch(SOURCES.nws.alertsApi, { headers: { "Accept": "application/geo+json" } });
    const data = await res.json();
    // Filter for AKQ counties of interest
    const countiesSet = new Set(COUNTY_NAMES.map(n => n.toUpperCase()));
    const items = (data.features || []).filter(f => {
      const area = (f.properties?.areaDesc || "").toUpperCase();
      return [...countiesSet].some(n => area.includes(n));
    });
    alertsListEl.innerHTML = "";
    items.slice(0, 8).forEach(a => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div><strong>${a.properties.event}</strong> — ${a.properties.severity || "N/A"}</div>
        <div class="muted">${a.properties.headline || ""}</div>
      `;
      alertsListEl.appendChild(li);
    });
    if (!items.length) {
      alertsListEl.innerHTML = "<li>No active AKQ alerts for listed counties.</li>";
    }
  } catch (e) {
    alertsListEl.innerHTML = "<li>Alerts unavailable. Check NWS AKQ.</li>";
  }
}

// Observation fetch (WU pages are HTML; use server-side or fallback to sample JSON)
async function loadObservations() {
  // Fallback: local sample file; replace with a server-side proxy if you want live scraping
  try {
    const sample = await fetch("assets/data/sample-observations.json").then(r => r.json());
    COUNTY_NAMES.forEach(n => renderCountyRow(n, sample[n] || null));
  } catch {
    COUNTY_NAMES.forEach(n => renderCountyRow(n, null));
  }
}

// Danger class comparison (local heuristic vs DOF)
function computeLocalClass(obs) {
  if (!obs) return 1;
  const rh = Number(obs.rh), wind = Number(obs.wind), temp = Number(obs.temp), kbdi = Number(obs.kbdi || 0);
  let base = 1;
  if (rh <= 35 || wind >= 10 || temp >= 80) base = 2;
  if (rh <= 30 || wind >= 15 || temp >= 86) base = 3;
  if ((rh <= 25 && wind >= 18) || kbdi >= 400) base = 4;
  if ((rh <= 20 && wind >= 20 && temp >= 90) || kbdi >= 600) base = 5;
  // 30/30/30 crossover
  if (rh <= 30 && wind >= 15 && temp > 86) base = Math.min(5, base + 1);
  return base;
}

function renderDangerClass(sample) {
  const root = document.getElementById("dangerClass");
  root.innerHTML = "";
  COUNTY_NAMES.forEach(name => {
    const obs = sample?.[name] || null;
    const local = computeLocalClass(obs);
    const dof = obs?.dofClass ?? null;
    const div = document.createElement("div");
    div.className = "metrics";
    div.innerHTML = `
      <div class="title">${name}</div>
      <div class="row">
        <span>Local: <span class="badge badge-${local}">${local}</span></span>
        <span>DOF: ${dof ? `<span class="badge badge-${dof}">${dof}</span>` : "--"}</span>
      </div>
    `;
    root.appendChild(div);
  });
}

(async function bootstrap() {
  await initMap();
  await fetchNwsAlerts();
  await loadObservations().then(async () => {
    try {
      const sample = await fetch("assets/data/sample-observations.json").then(r => r.json());
      renderDangerClass(sample);
    } catch {
      renderDangerClass(null);
    }
  });
})();
