import { mockHomeMapTiles, openHomeMenu } from "./helpers/home-controls";
import { expect, loadAllTestAccounts, test } from "deepspace/testing";
import type { Page } from "@playwright/test";
test.skip(loadAllTestAccounts().length < 1, "Requires test account");
const result = { label: "Live web results", answer: "The telephone was patented in 1876; attribution has historical disputes.", sources: [
  { title: "Telephone history", domain: "example.org", url: "https://example.org/telephone", date: "2026-10-05" },
  { title: "Historical records", domain: "example.com", url: "https://example.com/history" },
], retrievedAt: "2026-10-05T12:00:00Z" };
async function boundaries(page: Page) {
  await mockHomeMapTiles(page);
  await page.route("**/api/jarvis/search/config", r => r.fulfill({ json: { configured: true } }));
  await page.route("**/api/jarvis/capabilities", r => r.fulfill({ json: { fishVoice: false } }));
  await page.route("**/api/jarvis/connections/home-assistant/config", r => r.fulfill({ json: { available: false, enabled: false } }));
  await page.route("**/api/jarvis/connections/weather", r => r.fulfill({ status: 502, json: { error: "weather_unavailable" } }));
}
async function ask(page: Page) {
  await page.getByRole("textbox", { name: "Message JARVIS", exact: true }).fill("Who invented the telephone?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
}
test("Phase 5 research displays real sources and one truthful activity entry", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page);
  let calls = 0;
  await page.route("**/api/jarvis/search", r => { calls++; expect(r.request().postDataJSON()).toEqual({ query: "Who invented the telephone" }); return r.fulfill({ json: result }); });
  await page.goto("/home"); await ask(page);
  const panel = page.getByRole("region", { name: "Live web results", exact: true });
  await expect(panel).toContainText(result.answer); await expect(panel.getByRole("link")).toHaveCount(2);
  await expect(panel.getByRole("link", { name: "Telephone history" })).toHaveAttribute("href", "https://example.org/telephone");
  await expect(panel).toContainText("example.org · 2026-10-05");
  await expect(page.getByText("Web search completed: Who invented the telephone", { exact: true })).toHaveCount(1); expect(calls).toBe(1);
});
test("Phase 5 disabled, missing-key, rate-limit and provider failure states do not fabricate results", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page);
  let code = "search_disabled";
  await page.route("**/api/jarvis/search", r => r.fulfill({ status: code === "search_unavailable" ? 429 : 409, json: { error: code, diagnostic: "private-provider-detail" } }));
  await page.goto("/home");
  for (const [error, message] of [["search_disabled", "Live web search is turned off."], ["search_not_connected", "Live web search is not connected yet."], ["search_unavailable", "Live web search is temporarily unavailable."]]) {
    code = error; await ask(page); await expect(page.locator(".assistant-panel")).toContainText(message);
    await expect(page.getByRole("region", { name: "Live web results", exact: true })).toHaveCount(0);
  }
  await expect(page.locator("body")).not.toContainText("private-provider-detail");
  await expect(page.getByText(/^Web search completed:/)).toHaveCount(0);
});
test("Phase 5 background cancellation does not create results or outage activity", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page);
  let finish!: () => void;
  await page.route("**/api/jarvis/search", async r => { await new Promise<void>(resolve => { finish = resolve; }); await r.fulfill({ status: 502, json: { error: "search_unavailable" } }).catch(() => {}); });
  await page.goto("/home"); const requested = page.waitForRequest("**/api/jarvis/search"); await ask(page); await requested;
  await expect(page.locator(".assistant-panel")).toContainText("Searching the web...");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide"))); finish();
  await expect(page.locator(".assistant-panel")).toContainText("Search cancelled.");
  await expect(page.locator(".assistant-panel")).not.toContainText("temporarily unavailable");
  await expect(page.getByText(/^Web search completed:/)).toHaveCount(0);
});
test("Phase 5 search preference persists and missing configuration never shows enabled", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page);
  await page.goto("/settings"); const toggle = page.getByRole("switch", { name: "Live web search", exact: true });
  await expect(toggle).toBeEnabled(); if (await toggle.isChecked()) await toggle.click();
  await expect(toggle).not.toBeChecked(); await page.reload(); await expect(toggle).not.toBeChecked();
  await toggle.click(); await expect(page.getByText("Search preference saved.", { exact: true })).toBeVisible();
  await page.reload(); await expect(toggle).toBeChecked();
  await page.route("**/api/jarvis/search/config", r => r.fulfill({ json: { configured: false } }));
  await page.reload(); await expect(toggle).not.toBeChecked(); await expect(toggle).toBeDisabled();
  await expect(page.getByRole("region", { name: "Live web search settings" })).toContainText("Live web search is not connected yet.");
});
test("Phase 5 spoken research uses the same search route and real sourced result", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page);
  await page.addInitScript(() => {
    const state = window as unknown as { searchRecognition: { onresult?: (event: unknown) => void } };
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: class {
      onresult?: (event: unknown) => void; onend?: () => void;
      start() { state.searchRecognition = this; } stop() { this.onend?.(); }
    } });
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(); await context.resume();
      const oscillator = context.createOscillator(); const target = context.createMediaStreamDestination();
      oscillator.connect(target); oscillator.start();
      target.stream.getTracks()[0].addEventListener("ended", () => { oscillator.stop(); void context.close(); });
      return target.stream;
    };
    speechSynthesis.speak = utterance => {
      setTimeout(() => { utterance.onstart?.(new SpeechSynthesisEvent("start", { utterance })); utterance.onend?.(new SpeechSynthesisEvent("end", { utterance })); }, 10);
    };
    speechSynthesis.cancel = () => {};
  });
  let calls = 0;
  await page.route("**/api/jarvis/search", r => { calls++; expect(r.request().postDataJSON()).toEqual({ query: "who invented the telephone" }); return r.fulfill({ json: result }); });
  await page.goto("/home"); await openHomeMenu(page); await page.getByRole("button", { name: "Full Screen Focus", exact: true }).click();
  await page.getByRole("button", { name: "Start Focus listening" }).click();
  await page.waitForFunction(() => Boolean((window as unknown as { searchRecognition: unknown }).searchRecognition));
  await page.evaluate(() => (window as unknown as { searchRecognition: { onresult: (event: unknown) => void } }).searchRecognition.onresult({ results: [Object.assign([{ transcript: "Jarvis, who invented the telephone?" }], { isFinal: true })] }));
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByRole("region", { name: "Jarvis Focus Mode" })).toContainText("telephone");
  await page.getByRole("button", { name: "Exit Focus Mode" }).click();
  await expect(page.getByRole("region", { name: "Live web results", exact: true })).toContainText(result.answer);
});
test("Phase 5 iPhone-sized conversation shows tappable source cards", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await boundaries(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/jarvis/search", r => r.fulfill({ json: result }));
  await page.goto("/home"); await ask(page);
  const panel = page.getByRole("region", { name: "Live web results", exact: true });
  await expect(panel).toBeVisible();
  expect(await panel.evaluate(element => element.closest(".message-list") !== null)).toBe(true);
  const links = panel.getByRole("link"); await expect(links).toHaveCount(2);
  for (const link of await links.all()) { await link.scrollIntoViewIfNeeded(); expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44); }
});
