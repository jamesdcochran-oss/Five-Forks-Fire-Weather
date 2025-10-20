// assets/js/app.js

// Initialize Leaflet map
const map = L.map('map').setView([37.2, -77.6], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Load AOI overlay (points + polygon)
fetch('assets/data/counties.geojson')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 5,
          fillColor: '#007bff',
          color: '#0056b3',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.6
        });
      },
      style: feature => {
        return feature.geometry.type === 'Polygon'
          ? {
              color: '#222',
              weight: 2,
              fillColor: '#ccc',
              fillOpacity: 0.2
            }
          : null;
      },
      onEachFeature: (feature, layer) => {
        const title = feature.properties.title || feature.properties.name || 'AOI';
        layer.bindPopup(title);
      }
    }).addTo(map);
  });

// Load FIRMS-style hotspots
fetch('assets/data/hotspots.geojson')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 6,
          fillColor: 'red',
          color: '#900',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8
        });
      },
      onEachFeature: (feature, layer) => {
        layer.bindPopup(`🔥 Hotspot<br>Confidence: ${feature.properties.confidence}`);
      }
    }).addTo(map);
  });

// Load fire weather observations
fetch('assets/data/sample-observations.json')
  .then(res => res.json())
  .then(data => {
    const container = document.getElementById('observations');
    data.forEach(obs => {
      const div = document.createElement('div');
      div.className = `obs danger-${obs.danger_class.toLowerCase()}`;
      div.innerHTML = `
        <strong>${obs.location}</strong><br>
        Temp: ${obs.temp}°F<br>
        RH: ${obs.rh}%<br>
        Wind: ${obs.wind} mph<br>
        Danger: ${obs.danger_class}
      `;
      container.appendChild(div);
    });
  });

// Theme toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
});
