import { mockHomeMapTiles, openHomeActivity } from "./helpers/home-controls";
import { expect, loadAllTestAccounts, test } from "deepspace/testing";
import type { Page } from "@playwright/test";

test.skip(loadAllTestAccounts().length < 1, "Requires test account");
async function boundaries(page: Page) {
  await mockHomeMapTiles(page);
  await page.route("**/api/health", r => r.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/jarvis/connections/home-assistant/config", r => r.fulfill({ json: { available: false, enabled: false } }));
  await page.route("**/api/jarvis/capabilities", r => r.fulfill({ json: { fishVoice: false } }));
}
async function saveLocation(page: Page) {
  await page.goto("/connections?tab=location");
  await page.getByRole("textbox", { name: "Place name" }).fill("Goldsboro health test");
  await page.getByRole("spinbutton", { name: "Latitude" }).fill("35.38");
  await page.getByRole("spinbutton", { name: "Longitude" }).fill("-77.99");
  const saved = page.waitForResponse(r => r.url().endsWith("/api/jarvis/connections/location") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save location", exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ success: true });
}
const weather = { location: "Goldsboro", temperature: 70, feelsLike: 68, condition: "Clear", description: "Clear", high: 75, low: 55, source: "Mock weather boundary", retrievedAt: "2026-10-05T12:00:00Z", forecast: [], humidity: 50, windSpeed: 2, approximate: true };

test("system health shares verified weather and on-demand map state between Home and Settings", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await boundaries(page);
  await page.route("**/api/jarvis/connections/weather", r => r.fulfill({ json: weather }));
  await saveLocation(page);
  await page.goto("/home");
  await expect(page.getByRole("region", { name: "System health", exact: true })).toContainText("SYSTEMS FULLY OPERATIONAL");
  await expect(page.locator(".hud-weather")).toContainText("70°F");
  await page.getByRole("textbox", { name: "Message JARVIS" }).fill("system status");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".assistant-panel")).toContainText("Systems are fully operational, Sir.");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const status = page.getByRole("region", { name: "System health", exact: true });
  await expect(status).toContainText("SYSTEMS FULLY OPERATIONAL");
  await expect(status).toContainText("Location map · disabled");
  await expect(status).toContainText("Turned off.");
  await expect(status).not.toContainText("LOCATION MAP · OFFLINE");
});

test("system health records one weather outage across refresh and then one recovery", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await boundaries(page);
  let available = false;
  await page.route("**/api/jarvis/connections/weather", r => available ? r.fulfill({ json: weather }) : r.fulfill({ status: 503, json: { error: "unavailable", diagnostic: "private-provider-diagnostic" } }));
  await saveLocation(page);
  await page.goto("/home");
  const status = page.getByRole("region", { name: "System health", exact: true });
  await expect(status).toContainText("SYSTEMS NOT FULLY OPERATIONAL, SIR.");
  await expect(status).toContainText("WEATHER UPDATES · OFFLINE");
  await openHomeActivity(page);
  const activity = page.getByRole("region", { name: "System health activity", exact: true });
  await expect(activity.getByText("Weather updates · Offline", { exact: true })).toHaveCount(1);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(status).toContainText("WEATHER UPDATES · OFFLINE");
  await expect(activity.getByText("Weather updates · Offline", { exact: true })).toHaveCount(1);
  available = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(status).toContainText("SYSTEMS FULLY OPERATIONAL");
  await expect(activity.getByText("Weather updates · Recovered", { exact: true })).toHaveCount(1);
  await expect(activity.getByText("Weather updates · Offline", { exact: true })).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("private-provider-diagnostic");
});

test("system health cancels background weather checks without adding an outage", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await boundaries(page);
  await page.route("**/api/jarvis/connections/weather", r => r.fulfill({ json: weather }));
  await saveLocation(page); await page.goto("/home");
  const status = page.getByRole("region", { name: "System health", exact: true });
  await expect(status).toContainText("SYSTEMS FULLY OPERATIONAL");
  await page.unroute("**/api/jarvis/connections/weather");
  let finish!: () => void;
  await page.route("**/api/jarvis/connections/weather", async r => {
    await new Promise<void>(resolve => { finish = resolve; });
    await r.fulfill({ status: 503, json: { error: "unavailable" } }).catch(() => {});
  });
  const request = page.waitForRequest("**/api/jarvis/connections/weather");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await request;
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("pagehide")); });
  finish();
  await openHomeActivity(page);
  await expect(page.getByRole("region", { name: "System health activity", exact: true })).not.toContainText("Weather updates · Offline");
});

test("system health speaks an unchanged weather outage only once and announces recovery", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await boundaries(page);
  await page.addInitScript(() => {
    const state = window as unknown as { healthSpeech: string[] };
    state.healthSpeech = [];
    window.speechSynthesis.speak = utterance => {
      if (!utterance.text.trim() || utterance.volume === 0) return;
      state.healthSpeech.push(utterance.text);
      setTimeout(() => utterance.onstart?.(new Event("start") as SpeechSynthesisEvent), 0);
      setTimeout(() => utterance.onend?.(new Event("end") as SpeechSynthesisEvent), 25);
    };
  });
  await page.route("**/api/tts", r => r.fulfill({ status: 503, json: { provider: "fish_audio", category: "provider-error", providerStatus: 503 } }));
  let available = false;
  await page.route("**/api/jarvis/connections/weather", r => available ? r.fulfill({ json: weather }) : r.fulfill({ status: 503, json: { error: "unavailable" } }));
  await saveLocation(page); await page.goto("/home");
  await expect(page.getByRole("region", { name: "System health", exact: true })).toContainText("WEATHER UPDATES · OFFLINE");
  expect(await page.evaluate(() => (window as unknown as { healthSpeech: string[] }).healthSpeech)).toEqual([]);
  await page.getByRole("button", { name: "Voice off · turn on", exact: true }).click();
  const warningCount = () => page.evaluate(() => (window as unknown as { healthSpeech: string[] }).healthSpeech.filter(s => s.includes("Weather updates are offline")).length);
  await expect.poll(warningCount).toBe(1);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("region", { name: "System health", exact: true })).toContainText("WEATHER UPDATES · OFFLINE");
  expect(await warningCount()).toBe(1);
  available = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("region", { name: "System health", exact: true })).toContainText("SYSTEMS FULLY OPERATIONAL");
  await expect.poll(() => page.evaluate(() => (window as unknown as { healthSpeech: string[] }).healthSpeech.filter(s => s === "Systems are fully operational again, Sir.").length)).toBe(1);
  expect(await warningCount()).toBe(1);
});
