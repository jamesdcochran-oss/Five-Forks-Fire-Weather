// Five Forks Fire Weather Dashboard - Main JavaScript
// Coordinates: Five Forks, Virginia (approx 36.8°N, 79.1°W)

// Configuration
const CONFIG = {
  fiveForks: {
    lat: 36.8,
    lon: -79.1,
    name: 'Five Forks District'
  },
  forecastURL: 'https://raw.githubusercontent.com/jamesdcochran-oss/Virginia-2025-Fall-Fire-Season/main/forecasts/current-forecast.html',
  nwsGridpoint: 'https://api.weather.gov/gridpoints/RNK/58,60',
  firmsURL: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/c6e1534c1d57bc74f7bd8fa3f7715fd5/VIIRS_SNPP_NRT',
  refreshInterval: 600000 // 10 minutes
};

// State
let map = null;
let hotspotLayer = null;
let weatherData = null;

// Initialize dashboard on load
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadAllData();
  setupEventListeners();
  
  // Auto-refresh every 10 minutes
  setInterval(loadAllData, CONFIG.refreshInterval);
});

// Setup event listeners
function setupEventListeners() {
  document.getElementById('refresh-map').addEventListener('click', () => {
    loadFIRMSData();
  });
}

// Load all dashboard data
async function loadAllData() {
  updateLastUpdate();
  await Promise.all([
    loadForecast(),
    loadNWSWeather(),
    loadFIRMSData()
  ]);
}

// Update last update timestamp
function updateLastUpdate() {
  const now = new Date();
  const formatted = now.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
  document.getElementById('last-update').textContent = `Last updated: ${formatted}`;
}

// Load fire weather forecast from Virginia-2025-Fall-Fire-Season repo
async function loadForecast() {
  try {
    const response = await fetch(CONFIG.forecastURL);
    if (!response.ok) throw new Error('Forecast not available');
    
    const html = await response.text();
    document.getElementById('forecast-container').innerHTML = html;
  } catch (error) {
    console.error('Error loading forecast:', error);
    document.getElementById('forecast-container').innerHTML = 
      '<div class="error">Forecast temporarily unavailable. The daily forecast is generated at 10:00 UTC.</div>';
  }
}

// Load NWS weather data
async function loadNWSWeather() {
  try {
    const response = await fetch(CONFIG.nwsGridpoint);
    if (!response.ok) throw new Error('NWS data unavailable');
    
    const data = await response.json();
    weatherData = data.properties;
    
    updateWeatherDisplay(weatherData);
    calculateFireDanger(weatherData);
  } catch (error) {
    console.error('Error loading NWS weather:', error);
    displayWeatherError();
  }
}

// Update weather display with current conditions
function updateWeatherDisplay(data) {
  // Extract current values from the forecast periods
  const current = data.periods ? data.periods[0] : null;
  
  if (current) {
    // Temperature
    document.getElementById('temp-value').textContent = `${current.temperature}°F`;
    document.getElementById('temp-value').classList.remove('loading');
    
    // Humidity (if available)
    const humidity = current.relativeHumidity?.value || '--';
    document.getElementById('humidity-value').textContent = `${humidity}%`;
    document.getElementById('humidity-value').classList.remove('loading');
    
    // Wind
    const windSpeed = current.windSpeed?.replace(' mph', '') || '--';
    const windDir = current.windDirection || '--';
    document.getElementById('wind-value').textContent = `${windSpeed} mph`;
    document.getElementById('wind-direction').textContent = windDir;
    document.getElementById('wind-value').classList.remove('loading');
    
    // Populate detailed weather table
    populateWeatherTable(data);
  }
}

// Populate detailed weather table
function populateWeatherTable(data) {
  const tbody = document.getElementById('weather-table-body');
  const current = data.periods ? data.periods[0] : null;
  const forecast = data.periods ? data.periods[1] : null;
  
  if (!current) {
    tbody.innerHTML = '<tr><td colspan="3">Weather data unavailable</td></tr>';
    return;
  }
  
  tbody.innerHTML = `
    <tr>
      <td>Temperature</td>
      <td>${current.temperature}°F</td>
      <td>${forecast ? forecast.temperature + '°F' : 'N/A'}</td>
    </tr>
    <tr>
      <td>Humidity</td>
      <td>${current.relativeHumidity?.value || 'N/A'}%</td>
      <td>${forecast?.relativeHumidity?.value || 'N/A'}%</td>
    </tr>
    <tr>
      <td>Wind Speed</td>
      <td>${current.windSpeed || 'N/A'}</td>
      <td>${forecast?.windSpeed || 'N/A'}</td>
    </tr>
    <tr>
      <td>Wind Direction</td>
      <td>${current.windDirection || 'N/A'}</td>
      <td>${forecast?.windDirection || 'N/A'}</td>
    </tr>
    <tr>
      <td>Sky Condition</td>
      <td>${current.shortForecast || 'N/A'}</td>
      <td>${forecast?.shortForecast || 'N/A'}</td>
    </tr>
  `;
}

// Calculate fire danger using DOF/CSI methodology
function calculateFireDanger(data) {
  const current = data.periods ? data.periods[0] : null;
  if (!current) return;
  
  const temp = current.temperature || 70;
  const humidity = current.relativeHumidity?.value || 50;
  const windSpeed = parseInt(current.windSpeed) || 5;
  
  // Simplified fire danger calculation (DOF uses more complex NFDRS)
  let danger = 'LOW';
  let dangerClass = 'low';
  let description = 'Minimal fire danger';
  
  // High danger conditions
  if ((humidity < 30 && temp > 75 && windSpeed > 10) ||
      (humidity < 20 && windSpeed > 15)) {
    danger = 'HIGH';
    dangerClass = 'high';
    description = 'Critical fire weather conditions';
    showAlert('High fire danger conditions detected');
  }
  // Moderate danger
  else if ((humidity < 40 && temp > 70) || windSpeed > 15) {
    danger = 'MODERATE';
    dangerClass = 'moderate';
    description = 'Elevated fire danger';
  }
  
  const dangerElement = document.getElementById('fire-danger-level');
  dangerElement.textContent = danger;
  dangerElement.className = `stat-value fire-danger-${dangerClass}`;
  document.getElementById('fire-danger-text').textContent = description;
}

// Show alert banner
function showAlert(message) {
  const alert = document.getElementById('danger-alert');
  document.getElementById('alert-message').textContent = message;
  alert.classList.remove('hidden');
}

// Display weather error
function displayWeatherError() {
  document.getElementById('temp-value').textContent = 'Error';
  document.getElementById('humidity-value').textContent = 'Error';
  document.getElementById('wind-value').textContent = 'Error';
}

// Initialize Leaflet map
function initMap() {
  map = L.map('map').setView([CONFIG.fiveForks.lat, CONFIG.fiveForks.lon], 10);
  
  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(map);
  
  // Add Five Forks marker
  L.marker([CONFIG.fiveForks.lat, CONFIG.fiveForks.lon])
    .bindPopup('<b>Five Forks District</b>')
    .addTo(map);
  
  // Initialize hotspot layer
  hotspotLayer = L.layerGroup().addTo(map);
}

// Load FIRMS fire detection data
async function loadFIRMSData() {
  try {
    // Get data for last 24 hours in 50km radius around Five Forks
    const radius = 50; // km
    const days = 1;
    const url = `${CONFIG.firmsURL}/${CONFIG.fiveForks.lat},${CONFIG.fiveForks.lon}/${days}/${radius}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('FIRMS data unavailable');
    
    const csvText = await response.text();
    const hotspots = parseCSV(csvText);
    
    displayHotspots(hotspots);
    document.getElementById('hotspot-count').textContent = `${hotspots.length} detection${hotspots.length !== 1 ? 's' : ''}`;
  } catch (error) {
    console.error('Error loading FIRMS data:', error);
    document.getElementById('hotspot-count').textContent = 'Error loading data';
  }
}

// Parse CSV data from FIRMS
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',');
  const hotspots = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < headers.length) continue;
    
    const hotspot = {};
    headers.forEach((header, index) => {
      hotspot[header.trim()] = values[index].trim();
    });
    
    hotspots.push(hotspot);
  }
  
  return hotspots;
}

// Display hotspots on map
function displayHotspots(hotspots) {
  // Clear existing hotspots
  hotspotLayer.clearLayers();
  
  if (hotspots.length === 0) return;
  
  hotspots.forEach(spot => {
    const lat = parseFloat(spot.latitude);
    const lon = parseFloat(spot.longitude);
    const confidence = spot.confidence?.toLowerCase() || 'nominal';
    const brightness = spot.bright_ti4 || 'N/A';
    const datetime = spot.acq_date + ' ' + spot.acq_time;
    
    // Color code by confidence
    let color = '#FFA500'; // nominal
    if (confidence === 'high') color = '#FF0000';
    else if (confidence === 'low') color = '#FFFF00';
    
    const circle = L.circleMarker([lat, lon], {
      radius: 8,
      fillColor: color,
      color: '#000',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.7
    });
    
    circle.bindPopup(`
      <b>Fire Detection</b><br>
      Confidence: ${confidence}<br>
      Brightness: ${brightness}K<br>
      Time: ${datetime}
    `);
    
    circle.addTo(hotspotLayer);
  });
  
  // Fit map to show all hotspots if any exist
  if (hotspots.length > 0) {
    const bounds = hotspotLayer.getBounds();
    map.fitBounds(bounds, { padding: [50, 50] });
  }
}
