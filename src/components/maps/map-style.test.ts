import { expect, it } from "vitest";
import { tacticalStyle, MAP_TILEJSON } from "./map-style";
it("uses real key-free vector tiles and visible required attribution", () => {
  const style = tacticalStyle(); expect(style.sources.basemap).toMatchObject({ type: "vector", url: MAP_TILEJSON });
  expect(JSON.stringify(style)).not.toMatch(/apiKey|access_token|secret|192\.168/);
  expect(JSON.stringify(style.sources)).toContain("OpenFreeMap"); expect(JSON.stringify(style.sources)).toContain("OpenMapTiles"); expect(JSON.stringify(style.sources)).toContain("OpenStreetMap contributors");
});
it("styles actual geographic layers with dark water, cyan roads and readable labels", () => {
  const style = tacticalStyle(); expect(style.layers.find(layer => layer.id === "main-roads")).toMatchObject({ type: "line", "source-layer": "transportation", paint: { "line-color": "#1ba4d4" } });
  expect(style.layers.find(layer => layer.id === "water")).toMatchObject({ type: "fill", "source-layer": "water" });
  expect(style.layers.some(layer => layer.type === "symbol")).toBe(true);
});
