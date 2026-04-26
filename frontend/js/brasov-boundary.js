//contur judet brasov
//incarca si afiseaza conturul judetului brasov pe harta
//foloseste un fisier geojson - brasov geojson - cu granitele administrative
//fallback - dreptunghi aproximativ
//variabila pentru a pastra referinta la layer-ul conturului
let brasovBoundaryLayer = null;

//1. incearca sa incarce fisierul brasov.geojson
//2. afiseaza conturul/afiseaza un dreptunghi
//centreaza harta pe conturul incarcat
export function highlightBrasov(mapInstance) {
  fetch("brasov.geojson")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((geojsonData) => {
      //adauga conturul pe harta
      brasovBoundaryLayer = L.geoJSON(geojsonData, {
        style: {
          color: "#7f0000ff",
          weight: 2,
          fillColor: "#a9ba9d71",
          fillOpacity: 0.4,
        },
        className: "brasov-boundary-layer",
      }).addTo(mapInstance);

      //centreaza harta pe contur
      mapInstance.fitBounds(brasovBoundaryLayer.getBounds());
    })
    .catch((error) => {
      console.error("Eroare la încărcarea fișierului GeoJSON:", error);

      //deseneaza un dreptunghi aproximativ
      const brasovBounds = L.latLngBounds([45.4, 25.0], [46.1, 26.2]);

      brasovBoundaryLayer = L.rectangle(brasovBounds, {
        color: "red",
        weight: 2,
        fillColor: "#a9ba9dc5",
        fillOpacity: 0.4,
        className: "brasov-boundary-layer",
      })
        .addTo(mapInstance)
        .bindPopup("Județul Brașov<br>(contur aproximativ)");

      mapInstance.fitBounds(brasovBounds);
    });
}

export function getBrasovLayers() {
  return {
    boundary: brasovBoundaryLayer,
  };
}
