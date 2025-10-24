console.log("🔥 Five Forks Fire Weather Dashboard Loaded");

// --- NEW HELPER FUNCTION: VA DOF DANGER HEURISTIC ---
/**
 * Calculates a Virginia Fire Danger Level based on common fire weather criteria.
 * This is a customized heuristic, not an official NFDRS calculation.
 * @param {number} temp - Temperature in Fahrenheit.
 * @param {number} rh - Relative Humidity percentage.
 * @param {number} wind - Wind speed (numeric part only, without units).
 * @returns {{level: string, color: string, emoji: string}}
 */
function getVADOFDangerLevel(temp, rh, wind) {
  // Ensure we have numbers to work with, using default low-risk values if N/A
  const t = parseFloat(temp) || 70;
  const h = parseFloat(rh) || 70;
  const w = parseFloat(wind.split(' ')[0]) || 5; // Extracts number from "5 mph"

  // CRITICAL/EXTREME: Low RH and high wind/temp
  if ((h <= 25 && w >= 15) || (h <= 20 && t >= 85)) {
    return { level: 'EXTREME', color: '#cc3300', emoji: '🔥🔥🔥' }; // Deep Red
  } 
  // HIGH: Dry and breezy
  else if (h <= 30 && w >= 10) {
    return { level: 'HIGH', color: '#ff6600', emoji: '🔥' }; // Orange
  } 
  // MODERATE: Approaching dryness or moderate wind
  else if (h <= 45 || w >= 10) {
    return { level: 'MODERATE', color: '#ffc107', emoji: '⚠️' }; // Yellow
  } 
  // LOW: Wet or calm conditions
  else {
    return { level: 'LOW', color: '#28a745', emoji: '💧' }; // Green
  }
}

// NOAA Weather API Fallback Fetch
async function fetchWeather(county) {
  try {
    const pointRes = await fetch(`https://api.weather.gov/points/${county.lat},${county.lon}`);
    const pointData = await pointRes.json();
    const hourlyUrl = pointData.properties.forecastHourly;
    const forecastRes = await fetch(hourlyUrl);
    const forecastData = await forecastRes.json();
    const now = forecastData.properties.periods[0];
    
    // Extract wind speed value (e.g., "10 to 15 mph" -> "15 mph")
    const windSpeedStr = now.windSpeed.includes('to') ? now.windSpeed.split(' to ')[1] : now.windSpeed;

    const weather = {
      emoji: '🌤️',
      label: now.shortForecast || 'N/A',
      temp: now.temperature,
      rh: now.relativeHumidity?.value || 'N/A',
      wind: windSpeedStr,
      dir: now.windDirection
    };

    // Calculate Danger Level and add to the weather object
    const danger = getVADOFDangerLevel(weather.temp, weather.rh, weather.wind);
    weather.danger = danger.level;
    weather.dangerColor = danger.color;
    weather.dangerEmoji = danger.emoji;
    
    return weather;

  } catch (error) {
    console.warn(`⚠️ NOAA data fallback for ${county.name}`, error);
    return {
      emoji: '❓',
      label: 'N/A',
      temp: 'N/A',
      rh: 'N/A',
      wind: 'N/A',
      dir: 'N/A',
      danger: 'UNKNOWN',
      dangerColor: '#6c757d',
      dangerEmoji: '❓'
    };
  }
}

// NASA FIRMS GeoJSON fetch with fallback
async function fetchHotspots() {
  try {
    const res = await fetch("https://firms.modaps.eosdis.nasa.gov/active_fire/c6.1/geojson/MODIS_C6_1_USA_contiguous_and_Hawaii_24h.geojson");
    return await res.json();
  } catch (error) {
    console.warn("⚠️ FIRMS data fallback");
    return { type: "FeatureCollection", features: [] };
  }
}

// --- UPDATED renderCard FUNCTION ---
function renderCard(county, weather, hotspotsCount) {
  const container = document.getElementById("cards");
  const card = document.createElement("div");
  
  // Apply the dynamic color for the card's border/background if desired via CSS
  card.className = "card";
  card.style.borderColor = weather.dangerColor; // Use color for visual cue
  
  card.innerHTML = `
    <h3 style="color: ${weather.dangerColor};">
        ${weather.dangerEmoji} ${county.name} - ${weather.danger}
    </h3>
    <p><strong>Wx:</strong> ${weather.temp}°F · ${weather.rh}% RH · ${weather.wind} ${weather.dir}</p>
    <p><strong>Forecast:</strong> ${weather.label}</p>
    <p><strong>Hotspots (20km):</strong> <span style="font-weight: bold; color: ${hotspotsCount > 0 ? '#cc3300' : 'inherit'};">${hotspotsCount}</span></p>`;
  container.appendChild(card);
}

function showHotspotsOnMap(geojson, counties, weatherData) {
  // --- Initialization ---
  const map = L.map('map').setView([37.1, -77.5], 8);
  
  // Base Layer (OpenStreetMap)
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
  osm.addTo(map);

  // --- 1. Define Layer Groups ---
  const fireMarkers = L.layerGroup();
  const weatherMarkers = L.layerGroup();
  const countyBuffers = L.layerGroup();
  
  // --- 2. Populate Hotspots Layer ---
  L.geoJSON(geojson, {
    pointToLayer: (f, latlng) =>
      L.circleMarker(latlng, {
        radius: 5,
        fillColor: "#ff3b30",
        color: "#ff3b30",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
      }).bindPopup("🔥 Fire detected")
  }).addTo(fireMarkers);

  // --- 3. Populate Weather Markers and County Buffers Layers ---
  counties.forEach((county, idx) => {
    const weather = weatherData[idx];

    // Create the Weather Marker (Popup)
    const marker = L.marker([county.lat, county.lon])
      .bindPopup(
        `<strong>${county.name} - ${weather.danger}</strong><br>
         ${weather.emoji} ${weather.label}<br>
         Temp: ${weather.temp}°F<br>
         RH: ${weather.rh}%<br>
         Wind: ${weather.wind} ${weather.dir}`
      );
    marker.addTo(weatherMarkers);

    // Create the 20km Buffer Circle
    const buffer = L.circle([county.lat, county.lon], {
      radius: 20000, // 20 kilometers = 20,000 meters
      color: weather.dangerColor, // Use danger color for the buffer!
      fillColor: weather.dangerColor,
      fillOpacity: 0.05,
      weight: 2,
      dashArray: '5, 5'
    }).bindPopup(`${county.name} Hotspot Search Area (20 km)`);
    buffer.addTo(countyBuffers);
  });
  
  // --- 4. Add Default Layers to Map and Control ---
  fireMarkers.addTo(map);
  weatherMarkers.addTo(map);

  const overlayMaps = {
    "🔥 Active Hotspots": fireMarkers,
    "☀️ Weather Markers": weatherMarkers,
    "🔍 20km Search Buffers": countyBuffers
  };

  const baseMaps = {
    "OpenStreetMap": osm
  };

  L.control.layers(baseMaps, overlayMaps).addTo(map);
}


const counties = [
  { name: "Amelia", lat: 37.342, lon: -77.980 },
  { name: "Nottoway", lat: 37.142, lon: -78.089 },
  { name: "Dinwiddie", lat: 37.077, lon: -77.587 },
  { name: "Prince George", lat: 37.221, lon: -77.288 }
];

async function refreshData() {
  document.getElementById("cards").innerHTML = "";
  const fireData = await fetchHotspots();

  // Fetch all weather in parallel for speed
  const weatherPromises = counties.map(county => fetchWeather(county));
  const weatherData = await Promise.all(weatherPromises);

  for (let i = 0; i < counties.length; i++) {
    const county = counties[i];
    const weather = weatherData[i];
    
    // NOTE: This uses the global turf object which must be loaded in the HTML.
    const hotspots = fireData.features.filter(f =>
      turf.booleanPointInPolygon(
        turf.point([f.geometry.coordinates[0], f.geometry.coordinates[1]]),
        turf.circle([county.lon, county.lat], 20, { units: 'kilometers' })
      )
    );
    renderCard(county, weather, hotspots.length);
  }

  showHotspotsOnMap(fireData, counties, weatherData);
}

window.onload = () => {
  refreshData();
  setInterval(refreshData, 3600000); // every hour
};
