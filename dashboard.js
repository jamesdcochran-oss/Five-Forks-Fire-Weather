console.log("🔥 Five Forks Fire Weather Dashboard Loaded");

// --- 1. DEFINITIONS: SIX COUNTIES AND AREA POLYGON ---
// Coordinates are pulled directly from the provided GeoJSON.
const counties = [
  // Dinwiddie: [-77.60261, 37.02153]
  { name: "Dinwiddie", lat: 37.02153, lon: -77.60261 },
  // Amelia: [-77.99537, 37.32646]
  { name: "Amelia", lat: 37.32646, lon: -77.99537 },
  // Nottoway: [-78.03382, 37.14824]
  { name: "Nottoway", lat: 37.14824, lon: -78.03382 },
  // Brunswick: [-77.85049, 36.78112]
  { name: "Brunswick", lat: 36.78112, lon: -77.85049 },
  // Greensville: [-77.56347, 36.6413]
  { name: "Greensville", lat: 36.64130, lon: -77.56347 },
  // Prince George: [-77.18101, 37.1881]
  { name: "Prince George", lat: 37.18810, lon: -77.18101 }
];

// This GeoJSON object represents the large polygon boundary
// (ID: 5785a3d9-f1e7-4903-be7d-0a2c6792938d) from the uploaded file.
const areaPolygonGeoJSON = {
  "type": "Feature",
  "properties": {
    "title": "Monitoring Area",
    "fill": "#FF0000",
    "stroke": "#FF0000",
    "stroke-opacity": 1,
    "stroke-width": 2,
    "fill-opacity": 0.08, // Subtle fill
    "class": "Shape"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [-78.2350117578125, 37.363789898359414], [-78.23089188476563, 37.29062448283949],
        [-78.240504921875, 37.11755644626926], [-78.21578568359375, 37.08250638697882],
        [-78.15948075195313, 37.04634403220737], [-78.07845658203125, 37.00797118486934],
        [-78.00567215820313, 37.020830045694964], [-78.0482441796875, 36.54218923323913],
        [-77.28744095703125, 36.54217934004624], [-77.41927689453125, 36.697591947028855],
        [-77.4549824609375, 36.74712573578124], [-77.46322220703125, 36.86427710321731],
        [-77.54012650390625, 36.859882122283764], [-77.6087910546875, 36.880756030323596],
        [-77.15423172851563, 37.115021710981814], [-77.07320755859375, 37.17741654078484],
        [-76.96471756835938, 37.247412528316616], [-76.99218338867188, 37.299453009740276],
        [-77.0210225, 37.306007271306434], [-77.06908768554688, 37.26776602706855],
        [-77.08282059570313, 37.27541583062041], [-77.09106034179688, 37.31365318781136],
        [-77.12813919921875, 37.303822580920595], [-77.23662918945313, 37.31692977113898],
        [-77.35473221679688, 37.23606570446547], [-77.32726639648438, 37.19231923958888],
        [-77.34374588867188, 37.16824787325909], [-77.39181107421875, 37.170436496249174],
        [-77.42339676757813, 37.16277603847045], [-77.43163651367188, 37.185755082241165],
        [-77.45635575195313, 37.18794319808966], [-77.44536942382813, 37.21638293433666],
        [-77.515407265625, 37.21857016247888], [-77.5978047265625, 37.25792942330379],
        [-77.64998978515625, 37.26667313454041], [-77.66646927734375, 37.29320183064708],
        [-77.71041458984375, 37.303033825915705], [-77.7680928125, 37.284461200413624],
        [-77.79830521484375, 37.328154196565244], [-77.84774369140625, 37.35435780585329],
        [-77.87520951171875, 37.38709945830021], [-77.86422318359375, 37.45318674511003],
        [-77.92876786132813, 37.48261602071299], [-78.00155228515625, 37.49787108359377],
        [-78.086696328125, 37.45588769581372], [-78.13888138671875, 37.46024816203661],
        [-78.18969315429688, 37.446075717235935], [-78.22539872070313, 37.40136041928257],
        [-78.23913163085938, 37.382812099276194], [-78.2350117578125, 37.362076193229214],
        [-78.2350117578125, 37.363789898359414]
      ]
    ]
  }
};

// Global map reference and Polygon bounds for reset functionality
let map;
let areaBounds; 


// --- HELPER FUNCTION: VA DOF DANGER HEURISTIC ---
function getVADOFDangerLevel(temp, rh, wind) {
  const t = parseFloat(temp) || 70;
  const h = parseFloat(rh) || 70;
  // Extract number from wind string (e.g., "15 mph")
  const w = parseFloat(wind.split(' ')[0]) || 5; 

  if ((h <= 25 && w >= 15) || (h <= 20 && t >= 85)) {
    return { level: 'EXTREME', color: '#cc3300', emoji: '🔥🔥🔥' }; // Deep Red
  } else if (h <= 30 && w >= 10) {
    return { level: 'HIGH', color: '#ff6600', emoji: '🔥' }; // Orange
  } else if (h <= 45 || w >= 10) {
    return { level: 'MODERATE', color: '#ffc107', emoji: '⚠️' }; // Yellow
  } else {
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
    
    const windSpeedStr = now.windSpeed.includes('to') ? now.windSpeed.split(' to ')[1] : now.windSpeed;

    const weather = {
      emoji: '🌤️',
      label: now.shortForecast || 'N/A',
      temp: now.temperature,
      rh: now.relativeHumidity?.value || 'N/A',
      wind: windSpeedStr,
      dir: now.windDirection
    };

    const danger = getVADOFDangerLevel(weather.temp, weather.rh, weather.wind);
    weather.danger = danger.level;
    weather.dangerColor = danger.color;
    weather.dangerEmoji = danger.emoji;
    
    return weather;

  } catch (error) {
    console.warn(`⚠️ NOAA data fallback for ${county.name}`, error);
    return {
      emoji: '❓', label: 'N/A', temp: 'N/A', rh: 'N/A',
      wind: 'N/A', dir: 'N/A', danger: 'UNKNOWN',
      dangerColor: '#6c757d', dangerEmoji: '❓'
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

// renderCard FUNCTION
function renderCard(county, weather, hotspotsCount) {
  const container = document.getElementById("cards");
  const card = document.createElement("div");
  
  card.className = "card";
  card.style.borderColor = weather.dangerColor;
  
  card.innerHTML = `
    <h3 style="color: ${weather.dangerColor};">
        ${weather.dangerEmoji} ${county.name} - ${weather.danger}
    </h3>
    <p><strong>Wx:</strong> ${weather.temp}°F · ${weather.rh}% RH · ${weather.wind} ${weather.dir}</p>
    <p><strong>Forecast:</strong> ${weather.label}</p>
    <p><strong>Hotspots (20km):</strong> <span style="font-weight: bold; color: ${hotspotsCount > 0 ? '#cc3300' : 'inherit'};">${hotspotsCount}</span></p>`;
  container.appendChild(card);
}

// --- UPDATED showHotspotsOnMap FUNCTION ---
function showHotspotsOnMap(geojson, counties, weatherData) {
  // Initialize map ONLY if it doesn't exist (prevents re-initializing on refresh)
  if (!map) {
    map = L.map('map');
  } else {
    // Clear all existing layers before adding new ones on refresh
    map.eachLayer(layer => {
      if (layer !== osm) { // Don't remove the base layer
        map.removeLayer(layer);
      }
    });
  }
  
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
  osm.addTo(map);

  // --- Map Layers ---
  const fireMarkers = L.layerGroup();
  const weatherMarkers = L.layerGroup();
  const countyBuffers = L.layerGroup();
  const areaBoundary = L.layerGroup(); 
  
  // 1. Add Area Boundary Polygon
  const polygonLayer = L.geoJSON(areaPolygonGeoJSON, {
      style: function(feature) {
          return {
              color: feature.properties.stroke,
              weight: feature.properties['stroke-width'],
              opacity: feature.properties['stroke-opacity'],
              fillColor: feature.properties.fill,
              fillOpacity: feature.properties['fill-opacity']
          };
      }
  }).addTo(areaBoundary);
  areaBounds = polygonLayer.getBounds(); // Save bounds for reset button
  
  // Set initial map view based on the polygon boundary
  map.fitBounds(areaBounds);

  // 2. Populate Hotspots Layer
  L.geoJSON(geojson, {
    pointToLayer: (f, latlng) =>
      L.circleMarker(latlng, {
        radius: 5, fillColor: "#ff3b30", color: "#ff3b30", weight: 1, 
        opacity: 1, fillOpacity: 0.8
      }).bindPopup("🔥 Fire detected")
  }).addTo(fireMarkers);

  // 3. Populate Weather Markers and County Buffers Layers
  counties.forEach((county, idx) => {
    const weather = weatherData[idx];

    const marker = L.marker([county.lat, county.lon])
      .bindPopup(
        `<strong>${county.name} - ${weather.danger}</strong><br>
         ${weather.emoji} ${weather.label}<br>
         Temp: ${weather.temp}°F<br>
         RH: ${weather.rh}%<br>
         Wind: ${weather.wind} ${weather.dir}`
      );
    marker.addTo(weatherMarkers);

    const buffer = L.circle([county.lat, county.lon], {
      radius: 20000, 
      color: weather.dangerColor,
      fillColor: weather.dangerColor,
      fillOpacity: 0.05,
      weight: 2,
      dashArray: '5, 5'
    }).bindPopup(`${county.name} Hotspot Search Area (20 km)`);
    buffer.addTo(countyBuffers);
  });
  
  // --- 4. Add Default Layers to Map and Control ---
  areaBoundary.addTo(map); // Keep boundary visible by default
  fireMarkers.addTo(map);
  weatherMarkers.addTo(map);

  const overlayMaps = {
    "🔥 Active Hotspots": fireMarkers,
    "☀️ Weather Markers": weatherMarkers,
    "🔍 20km Search Buffers": countyBuffers,
    "🗺️ Monitoring Boundary": areaBoundary
  };

  const baseMaps = {
    "OpenStreetMap": osm
  };

  L.control.layers(baseMaps, overlayMaps).addTo(map);
  
  // 5. Add Reset View Control
  addResetControl(map, areaBounds);
}

// --- NEW FUNCTION: Reset View Control ---
function addResetControl(map, bounds) {
    const CustomControl = L.Control.extend({
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
            container.innerHTML = '🔄 Reset View';
            container.style.backgroundColor = 'white';
            container.style.padding = '5px 10px';
            container.style.cursor = 'pointer';
            container.title = 'Zoom to Six-County Area';
            
            L.DomEvent.on(container, 'click', function() {
                map.fitBounds(bounds, {
                    padding: [20, 20],
                    duration: 1.5 // Subtle movement animation
                });
            });
            return container;
        }
    });
    
    // Add the control to the top right of the map
    map.addControl(new CustomControl({ position: 'topright' }));
}

async function refreshData() {
  document.getElementById("cards").innerHTML = "";
  const fireData = await fetchHotspots();

  const weatherPromises = counties.map(county => fetchWeather(county));
  const weatherData = await Promise.all(weatherPromises);

  for (let i = 0; i < counties.length; i++) {
    const county = counties[i];
    const weather = weatherData[i];
    
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
