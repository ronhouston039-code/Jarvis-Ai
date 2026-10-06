import { mockHomeMapTiles, openHomeActivity } from "./helpers/home-controls";
import { expect, loadAllTestAccounts, test } from "deepspace/testing";
import type { Page } from "@playwright/test";
test.skip(loadAllTestAccounts().length < 1, "Requires test account");
const snapshot = (unit = "fahrenheit", location = "Goldsboro, North Carolina") => ({ unit, location, temperature: unit === "celsius" ? 20 : 68, feelsLike: unit === "celsius" ? 18 : 64, condition: "Overcast", description: "Overcast", high: unit === "celsius" ? 22 : 72, low: unit === "celsius" ? 12 : 54, rainChance: 60, precipitation: 0.2, windSpeed: 10, humidity: 55, source: "Open-Meteo test boundary", retrievedAt: "2026-10-05T12:00:00Z", approximate: true, forecast: [] });
async function boundaries(page: Page) {
  await mockHomeMapTiles(page);
  await page.route("**/api/health", r => r.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/jarvis/connections/home-assistant/config", r => r.fulfill({ json: { available: false, enabled: false } }));
  await page.route("**/api/jarvis/capabilities", r => r.fulfill({ json: { fishVoice: false } }));
  await page.route("**/api/jarvis/connections/weather", r => r.fulfill({ json: snapshot() }));
}
async function ask(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Message JARVIS", exact: true }).fill(text);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
}
test("Phase 4 weather questions use live results, units and explicit cities without requesting GPS", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await boundaries(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition() { throw new Error("Unexpected GPS request"); } } });
  });
  const requests: string[] = [];
  await page.route("**/api/weather?*", r => { requests.push(r.request().url()); const query = new URL(r.request().url()).searchParams; return r.fulfill({ json: snapshot(query.get("unit") ?? "fahrenheit", query.get("city") === "London" ? "London, England" : undefined) }); });
  await page.goto("/home");
  await ask(page, "Jarvis, what's the weather?");
  await expect(page.locator(".assistant-panel")).toContainText("In Goldsboro, North Carolina");
  await expect(page.locator(".assistant-panel")).toContainText("68°F");
  await expect(page.locator(".assistant-panel")).toContainText("Source: Open-Meteo test boundary");
  await ask(page, "Weather in London in Celsius");
  await expect(page.locator(".assistant-panel")).toContainText("In London, England");
  await expect(page.locator(".assistant-panel")).toContainText("20°C");
  expect(new URL(requests[1]).searchParams.get("city")).toBe("London");
  expect(requests.every(url => !new URL(url).searchParams.has("lat"))).toBe(true);
});
test("Phase 4 current location denied falls back to Goldsboro without a false permission outage", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await boundaries(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition(_ok: unknown, denied: (e: unknown) => void) { denied({ code: 1 }); } } }));
  let city = "";
  await page.route("**/api/weather?*", r => { city = new URL(r.request().url()).searchParams.get("city") ?? ""; return r.fulfill({ json: snapshot() }); });
  await page.goto("/home"); await ask(page, "What's the weather in my current location?");
  await expect(page.locator(".assistant-panel")).toContainText("Location sharing is unavailable");
  await expect(page.locator(".assistant-panel")).toContainText("In Goldsboro, North Carolina");
  expect(city).toBe("Goldsboro, North Carolina, USA");
  await openHomeActivity(page);
  await expect(page.getByRole("region", { name: "System health activity", exact: true })).not.toContainText("Weather updates · Offline");
});
test("Phase 4 weather failure is sanitized and reflected in system health", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await boundaries(page);
  await page.route("**/api/weather?*", r => r.fulfill({ status: 502, json: { error: "weather_unavailable", diagnostic: "private-provider-body" } }));
  await page.goto("/home"); await ask(page, "Weather right now");
  await expect(page.locator(".assistant-panel")).toContainText("Weather data is unavailable right now");
  await expect(page.getByRole("region", { name: "System health", exact: true })).toContainText("WEATHER UPDATES · OFFLINE");
  await expect(page.locator("body")).not.toContainText("private-provider-body");
});
test("Phase 4 pagehide cancels pending weather without a delayed reply or outage", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await boundaries(page);
  let finish!: () => void;
  await page.route("**/api/weather?*", async r => {
    await new Promise<void>(resolve => { finish = resolve; });
    await r.fulfill({ status: 502, json: { error: "weather_unavailable" } }).catch(() => {});
  });
  await page.goto("/home");
  const requested = page.waitForRequest("**/api/weather?*"); await ask(page, "What's the weather?"); await requested;
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide"))); finish();
  await openHomeActivity(page);
  await expect(page.getByRole("region", { name: "System health activity", exact: true })).not.toContainText("Weather updates · Offline");
  await expect(page.locator(".assistant-panel")).not.toContainText("Weather data is unavailable");
});
test("Phase 4 temperature setting persists and updates the shared weather header", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await boundaries(page);
  let unit = "fahrenheit";
  await page.route("**/api/jarvis/connections/weather", r => r.fulfill({ json: snapshot(unit) }));
  await page.goto("/settings");
  await page.getByLabel("Temperature", { exact: true }).selectOption("celsius");
  unit = "celsius";
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByText("Preferences saved.", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel("Temperature", { exact: true })).toHaveValue("celsius");
  await page.getByRole("link", { name: "Back to JARVIS", exact: true }).click();
  await expect(page.locator(".hud-weather")).toContainText("20°C");
  await page.goto("/settings"); await page.getByLabel("Temperature", { exact: true }).selectOption("fahrenheit");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByText("Preferences saved.", { exact: true })).toBeVisible();
});
