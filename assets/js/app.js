// assets/js/app.js

// Initialize map
const map = L.map('map').setView([37.5, -79.8], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Load counties overlay
fetch('assets/data/counties.geojson')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      style: {
        color: '#555',
        weight: 1,
        fillOpacity: 0.1
      }
    }).addTo(map);
  });

// Load hotspots
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
