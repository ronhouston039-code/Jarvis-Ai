import type { StyleSpecification } from "maplibre-gl";
export const MAP_TILEJSON = "https://tiles.openfreemap.org/planet";
export function tacticalStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: { basemap: { type: "vector", url: MAP_TILEJSON, attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#020c18" } },
      { id: "parks", type: "fill", source: "basemap", "source-layer": "park", paint: { "fill-color": "#07312e" } },
      { id: "landcover", type: "fill", source: "basemap", "source-layer": "landcover", paint: { "fill-color": "#092b30", "fill-opacity": 0.6 } },
      { id: "water", type: "fill", source: "basemap", "source-layer": "water", paint: { "fill-color": "#053044" } },
      { id: "waterways", type: "line", source: "basemap", "source-layer": "waterway", paint: { "line-color": "#0b5060", "line-width": 1.5 } },
      { id: "minor-roads", type: "line", source: "basemap", "source-layer": "transportation", paint: { "line-color": "#31516b", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 16, 3] } },
      { id: "main-roads", type: "line", source: "basemap", "source-layer": "transportation", filter: ["in", "class", "motorway", "trunk", "primary", "secondary"], paint: { "line-color": "#1ba4d4", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1, 16, 5] } },
      { id: "road-labels", type: "symbol", source: "basemap", "source-layer": "transportation_name", minzoom: 12, layout: { "symbol-placement": "line", "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": 12 }, paint: { "text-color": "#c6e6f6", "text-halo-color": "#020c18", "text-halo-width": 2 } },
      { id: "places", type: "symbol", source: "basemap", "source-layer": "place", layout: { "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": 15 }, paint: { "text-color": "#e0f4ff", "text-halo-color": "#020c18", "text-halo-width": 2 } },
    ],
  };
}
