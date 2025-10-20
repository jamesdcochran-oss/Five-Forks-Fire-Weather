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
