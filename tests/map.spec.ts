import { openHomeActivity } from "./helpers/home-controls";
import { expect, loadAllTestAccounts, test } from "deepspace/testing";
import type { Page } from "@playwright/test";
test.skip(loadAllTestAccounts().length < 1, "Requires test account");
async function boundaries(page: Page, broken = false) {
  await page.route("**/api/health", r => r.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/jarvis/capabilities", r => r.fulfill({ json: { fishVoice: false } }));
  await page.route("**/api/jarvis/connections/home-assistant/config", r => r.fulfill({ json: { available: false, enabled: false } }));
  await page.route("**/api/jarvis/connections/weather", r => r.fulfill({ json: { location: "Goldsboro", temperature: 70, feelsLike: 68, description: "Clear", retrievedAt: "2026-10-05T12:00:00Z", forecast: [] } }));
  await page.route("https://tiles.openfreemap.org/**", r => {
    if (broken) return r.fulfill({ status: 503, body: "provider-boundary-failure" });
    if (r.request().url().endsWith("/planet")) return r.fulfill({ json: { tilejson: "3.0.0", tiles: ["https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14, attribution: "OpenFreeMap · OpenMapTiles · OpenStreetMap contributors" } });
    // Empty vector tile is an explicit external-data mock, not production map content.
    return r.fulfill({ contentType: "application/x-protobuf", body: Buffer.alloc(0) });
  });
}
async function geo(page: Page, deny = false) {
  await page.addInitScript(({ deny }) => {
    const state = window as unknown as { mapGeo: { starts: number; clears: number[]; success?: PositionCallback; denied?: PositionErrorCallback } };
    state.mapGeo = { starts: 0, clears: [] };
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      watchPosition(success: PositionCallback, denied: PositionErrorCallback) {
        state.mapGeo.starts++; state.mapGeo.success = success; state.mapGeo.denied = denied;
        if (deny) setTimeout(() => denied({ code: 1 } as GeolocationPositionError), 10);
        else setTimeout(() => success({ coords: { latitude: 35.39012345, longitude: -77.99812345, accuracy: 50 } } as GeolocationPosition), 10);
        return state.mapGeo.starts;
      },
      clearWatch(id: number) { state.mapGeo.clears.push(id); },
      getCurrentPosition() { throw new Error("Unexpected one-time GPS request"); },
    } });
  }, { deny });
}
const dialog = (page: Page) => page.getByRole("dialog", { name: "JARVIS // TACTICAL MAP", exact: true });
async function open(page: Page) {
  await page.getByRole("button", { name: "Open tactical map", exact: true }).click();
  await expect(dialog(page)).toBeVisible(); await expect(dialog(page).getByText("Map tiles loaded.", { exact: true })).toBeVisible();
}
test("Phase 6 real MapLibre canvas loads default Goldsboro with attribution and no automatic GPS", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page); await geo(page);
  await page.goto("/home"); await open(page);
  await expect(dialog(page).locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(dialog(page)).toContainText("Goldsboro, North Carolina");
  await expect(dialog(page).locator(".maplibregl-ctrl-attrib")).toContainText("OpenFreeMap");
  await expect(dialog(page).locator(".maplibregl-ctrl-attrib")).toContainText("OpenStreetMap");
  expect(await page.evaluate(() => (window as unknown as { mapGeo: { starts: number } }).mapGeo.starts)).toBe(0);
});
test("Phase 6 explicit sharing stays local and Stop Sharing rejects late callbacks", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page); await geo(page);
  const appRequests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/jarvis")) appRequests.push(request.url() + (request.postData() ?? "")); });
  await page.goto("/home"); await open(page); await dialog(page).getByRole("button", { name: "Show My Location", exact: true }).click();
  await expect(dialog(page)).toContainText("Accuracy 50 m");
  await dialog(page).getByRole("button", { name: "Stop Sharing", exact: true }).click();
  await expect(dialog(page)).toContainText("Location sharing is off. Showing Goldsboro, North Carolina.");
  expect(await page.evaluate(() => (window as unknown as { mapGeo: { clears: number[] } }).mapGeo.clears)).toEqual([1]);
  await page.evaluate(() => (window as unknown as { mapGeo: { success: PositionCallback } }).mapGeo.success({ coords: { latitude: 35.39012345, longitude: -77.99812345, accuracy: 50 } } as GeolocationPosition));
  await expect(dialog(page)).not.toContainText("Sharing while this map is open");
  expect(appRequests.some(request => request.includes("35.39012345") || request.includes("-77.99812345"))).toBe(false);
});
test("Phase 6 denied location keeps the real map online and shows exact Goldsboro fallback", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page); await geo(page, true);
  await page.goto("/home"); await open(page); await dialog(page).getByRole("button", { name: "Show My Location", exact: true }).click();
  await expect(dialog(page)).toContainText("Location sharing is off. Showing Goldsboro, North Carolina.");
  await expect(dialog(page)).toContainText("Map tiles loaded.");
  await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
  await openHomeActivity(page);
  await expect(page.getByRole("region", { name: "System health activity", exact: true })).not.toContainText("Location map · Offline");
});
test("Phase 6 closing and reopening never duplicates the map renderer or resumes sharing", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page); await geo(page);
  await page.goto("/home");
  for (let index = 0; index < 2; index++) {
    await open(page); await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
    await dialog(page).getByRole("button", { name: "Show My Location", exact: true }).click(); await expect(dialog(page)).toContainText("Accuracy 50 m");
    await page.locator("canvas.maplibregl-canvas").evaluate(e => e.setAttribute("data-preserved-map", "yes"));
    await dialog(page).getByRole("button", { name: "Close", exact: true }).click(); await expect(page.locator(".j-home-map canvas.maplibregl-canvas")).toHaveCount(1);
    await expect(page.locator(".j-home-map canvas.maplibregl-canvas")).toHaveAttribute("data-preserved-map", "yes");
  }
  expect(await page.evaluate(() => (window as unknown as { mapGeo: { clears: number[] } }).mapGeo.clears)).toEqual([1, 2]);
  await open(page); expect(await page.evaluate(() => (window as unknown as { mapGeo: { starts: number } }).mapGeo.starts)).toBe(2);
});
for (const event of ["pagehide", "visibilitychange"] as const) test(`Phase 6 ${event} synchronously stops GPS and never auto-resumes`, async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page); await geo(page);
  await page.goto("/home"); await open(page); await dialog(page).getByRole("button", { name: "Show My Location", exact: true }).click(); await expect(dialog(page)).toContainText("Accuracy 50 m");
  await page.evaluate(event => { if (event === "pagehide") window.dispatchEvent(new Event(event)); else { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event(event)); } }, event);
  await expect(dialog(page)).toHaveCount(0); await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { mapGeo: { clears: number[] } }).mapGeo.clears)).toEqual([1]);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(dialog(page)).toHaveCount(0); expect(await page.evaluate(() => (window as unknown as { mapGeo: { starts: number } }).mapGeo.starts)).toBe(1);
});
test("Phase 6 named place search uses existing geocoder and does not save a location", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page); await geo(page);
  let saves = 0; page.on("request", r => { if (r.url().endsWith("/api/jarvis/connections/location") && r.method() === "POST") saves++; });
  await page.route("**/api/jarvis/connections/cities?*", r => r.fulfill({ json: { places: [{ id: 1, name: "Raleigh", label: "Raleigh, North Carolina", latitude: 35.7796, longitude: -78.6382 }] } }));
  await page.goto("/home"); await open(page);
  await dialog(page).getByRole("textbox", { name: "Search Place", exact: true }).fill("Raleigh"); await dialog(page).getByRole("button", { name: "Search Place", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Raleigh, North Carolina", exact: true }).click();
  await expect(dialog(page)).toContainText("Viewing the selected place."); expect(saves).toBe(0);
  await dialog(page).getByRole("button", { name: "Goldsboro", exact: true }).click(); await expect(dialog(page)).toContainText("Goldsboro, North Carolina");
});
test("Phase 6 provider failure updates actual shared health without raw provider detail", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page, true); await geo(page);
  await page.goto("/home"); await page.getByRole("button", { name: "Open tactical map", exact: true }).click();
  await expect(dialog(page)).toContainText("Map is temporarily unavailable"); await expect(dialog(page)).not.toContainText("provider-boundary-failure");
  await expect(dialog(page).getByRole("button", { name: "Show My Location", exact: true })).toBeDisabled();
  await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
  await openHomeActivity(page);
  await expect(page.getByRole("region", { name: "System health activity", exact: true })).toContainText("Location map · Offline");
});
test("Phase 6 Settings map uses full-screen iPhone sheet and reduced motion", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page); await geo(page);
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings"); await open(page);
  const bounds = await dialog(page).boundingBox(); expect(bounds?.width).toBe(390); expect(bounds?.height).toBe(844);
  await expect(dialog(page)).toHaveCSS("transition-duration", "0s");
  expect(await dialog(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
test("Phase 6 text map intents open the viewer without requesting GPS or web research", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page); await geo(page);
  let research = 0; await page.route("**/api/jarvis/search", r => { research++; return r.fulfill({ status: 500 }); });
  await page.goto("/home"); await page.getByRole("textbox", { name: "Message JARVIS", exact: true }).fill("Jarvis, show my location"); await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(dialog(page)).toBeVisible(); await expect(dialog(page)).toContainText("Tap Show My Location");
  expect(await page.evaluate(() => (window as unknown as { mapGeo: { starts: number } }).mapGeo.starts)).toBe(0); expect(research).toBe(0);
});
