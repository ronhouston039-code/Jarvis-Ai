import { expect, it, vi } from "vitest";
import { accuracyArea, MAP_HOME, MapLocationSession, mapIntent, SHARING_OFF } from "./map-location";
function fixture() {
  let success!: PositionCallback, error!: PositionErrorCallback;
  const geo = { watchPosition: vi.fn((ok: PositionCallback, fail: PositionErrorCallback, _options?: PositionOptions) => { success = ok; error = fail; return 0; }), clearWatch: vi.fn() };
  const position = vi.fn(), status = vi.fn();
  const session = new MapLocationSession(geo, position, status);
  return { geo, position, status, session, get success() { return success; }, get error() { return error; } };
}
const coordinate = { coords: { latitude: 35.390123, longitude: -77.998123, accuracy: 50 } } as GeolocationPosition;
it("defaults to Goldsboro without starting location observation", () => {
  const f = fixture(); expect(MAP_HOME.label).toBe("Goldsboro, North Carolina"); expect(f.geo.watchPosition).not.toHaveBeenCalled(); f.session.dispose();
});
it("watches only after explicit start and returns real accuracy without storage or networking", () => {
  const f = fixture(); f.session.start(); f.success(coordinate);
  expect(f.geo.watchPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: false, timeout: 10000, maximumAge: 15000 });
  expect(f.position).toHaveBeenLastCalledWith({ latitude: 35.390123, longitude: -77.998123, accuracy: 50 });
  expect(f.status).toHaveBeenLastCalledWith("Sharing while this map is open · Accuracy 50 m");
});
it("denied permission returns the exact fallback without a provider-health outage", () => {
  const f = fixture(); f.session.start(); f.error({ code: 1 } as GeolocationPositionError);
  expect(f.geo.clearWatch).toHaveBeenCalledWith(0); expect(f.position).toHaveBeenLastCalledWith(null); expect(f.status).toHaveBeenLastCalledWith(SHARING_OFF);
});
it("Stop Sharing clears the zero-valued watch ID and rejects late callbacks", () => {
  const f = fixture(); f.session.start(); const late = f.success;
  f.session.stop(); f.position.mockClear(); late(coordinate);
  expect(f.geo.clearWatch).toHaveBeenCalledTimes(1); expect(f.position).not.toHaveBeenCalled();
});
it("repeated sharing replaces instead of accumulating watches", () => {
  const f = fixture(); f.session.start(); const old = f.success; f.session.start();
  f.position.mockClear(); old(coordinate); expect(f.position).not.toHaveBeenCalled();
  f.success(coordinate); expect(f.position).toHaveBeenCalledTimes(1); expect(f.geo.clearWatch).toHaveBeenCalledTimes(1);
  f.session.dispose(); expect(f.geo.clearWatch).toHaveBeenCalledTimes(2);
});
it("close/background disposal is idempotent and never resumes automatically", () => {
  const f = fixture(); f.session.start(); const late = f.success; f.session.dispose(); f.session.dispose(); f.session.start(); f.position.mockClear(); late(coordinate);
  expect(f.geo.clearWatch).toHaveBeenCalledTimes(1); expect(f.geo.watchPosition).toHaveBeenCalledTimes(1); expect(f.position).not.toHaveBeenCalled();
});
it("synchronously denied permission cannot leak the subsequently returned watch ID", () => {
  const geo = { watchPosition: vi.fn((_ok: PositionCallback, error: PositionErrorCallback) => { error({ code: 1 } as GeolocationPositionError); return 12; }), clearWatch: vi.fn() };
  const session = new MapLocationSession(geo, vi.fn(), vi.fn()); session.start(); expect(geo.clearWatch).toHaveBeenCalledWith(12);
});
it("unsupported GPS and invalid coordinates produce only truthful fallback", () => {
  const status = vi.fn(); new MapLocationSession(undefined, vi.fn(), status).start(); expect(status).toHaveBeenLastCalledWith(SHARING_OFF);
  const f = fixture(); f.session.start(); f.success({ coords: { latitude: NaN, longitude: 0, accuracy: 5 } } as GeolocationPosition); expect(f.position).toHaveBeenLastCalledWith(null); expect(f.status).toHaveBeenLastCalledWith(SHARING_OFF);
});
it("accuracy circle is closed, centered on actual coordinates and scales with real accuracy", () => {
  const area = accuracyArea(coordinate.coords); const ring = area.geometry.coordinates[0]; expect(ring).toHaveLength(65); expect(ring[0]).toEqual(ring[64]);
  expect(ring[0][1]).toBeGreaterThan(coordinate.coords.latitude); expect(ring[0][0]).toBeCloseTo(coordinate.coords.longitude, 6);
  const wide = accuracyArea({ ...coordinate.coords, accuracy: 100 }).geometry.coordinates[0]; expect(wide[0][1] - coordinate.coords.latitude).toBeCloseTo(2 * (ring[0][1] - coordinate.coords.latitude), 6);
});
it("recognizes only approved map intents and never turns other commands into GPS sharing", () => {
  for (const [text, intent] of [["Open map", "open"], ["Jarvis, show my location", "location"], ["Show Goldsboro", "home"], ["Show a map of Goldsboro", "home"], ["Stop sharing my location", "stop"]]) expect(mapIntent(text)).toBe(intent);
  for (const text of ["Turn off TV", "Play Vamp", "What's the weather in my location?", "Navigate home", "Open map and buy something"]) expect(mapIntent(text)).toBeNull();
});
