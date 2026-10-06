import { expect, loadAllTestAccounts, test } from "deepspace/testing";
import type { Page } from "@playwright/test";

test.skip(loadAllTestAccounts().length < 1, "Requires test account");
async function prepare(page: Page) {
  await page.route("**/api/health", r => r.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/jarvis/capabilities", r => r.fulfill({ json: { fishVoice: false } }));
  await page.route("**/api/jarvis/connections/home-assistant/config", r => r.fulfill({ json: { enabled: false, available: false } }));
  await page.route("**/api/jarvis/connections/weather", r => r.fulfill({ json: { location: "Goldsboro, North Carolina", temperature: 72, feelsLike: 70, retrievedAt: "2026-10-05T12:00:00Z", description: "Clear" } }));
  await page.route("https://tiles.openfreemap.org/**", async r => {
    if (process.env.JARVIS_CAPTURE_LIVE_MAP === "1") {
      const response = await fetch(r.request().url(), { signal: AbortSignal.timeout(15000) });
      return r.fulfill({ status: response.status, contentType: response.headers.get("content-type") ?? "application/octet-stream", body: Buffer.from(await response.arrayBuffer()) });
    }
    return r.request().url().endsWith("/planet")
    ? r.fulfill({ json: { tilejson: "3.0.0", tiles: ["https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14, attribution: "OpenFreeMap · OpenStreetMap contributors" } })
    : r.fulfill({ contentType: "application/x-protobuf", body: Buffer.alloc(0) });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { watchPosition() { throw new Error("Unexpected automatic GPS request"); }, clearWatch() {} } });
  });
}

test("Phase 8 Home HUD fits desktop, tablet and vertical iPhone without duplicate controls", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await prepare(page); await page.goto("/home");
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Talk mode", exact: true })).not.toBeVisible();
  await expect(page.locator(".j-home-map canvas.maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".j-home-actions > *")).toHaveCount(7);
  await expect(page.locator(".j-home-actions")).toHaveText("TVMusicRemindersSearchMapsSecurityMore");
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: width < 641 ? 844 : 1000 });
    await expect(page.locator(".hud-brand h1")).toHaveText("JARVIS");
    await expect(page.getByRole("textbox", { name: "Message JARVIS", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Start voice input", exact: true })).toHaveCount(1);
    await expect(page.getByRole("region", { name: "System health", exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const overlapping = await page.locator(".hud-bottom .composer").evaluate(element => {
      const input = element.querySelector("textarea")!.getBoundingClientRect();
      const mic = element.querySelector(".mic-button")!.getBoundingClientRect();
      return input.right > mic.left;
    });
    expect(overlapping).toBe(false);
    if (width >= 1000) {
      const fit = await page.evaluate(() => {
        const core = document.querySelector(".j-home-core")!.getBoundingClientRect();
        const actions = document.querySelector(".j-home-actions")!.getBoundingClientRect();
        const bar = document.querySelector(".j-home-command")!.getBoundingClientRect();
        return core.bottom <= actions.top && actions.bottom <= bar.top && bar.bottom <= innerHeight;
      });
      expect(fit).toBe(true);
    }
    if (width < 641) {
      const ordered = await page.evaluate(() => {
        const selectors = [".j-home-greeting", ".j-home-core", ".j-home-weather", ".j-home-map", ".j-home-actions"];
        const bounds = selectors.map(s => document.querySelector(s)!.getBoundingClientRect());
        return bounds.every((b, i) => !i || b.top >= bounds[i - 1].bottom);
      });
      expect(ordered).toBe(true);
      await expect(page.locator(".j-home-command")).toHaveCSS("position", "fixed");
      const mic = await page.getByRole("button", { name: "Start voice input", exact: true }).boundingBox();
      expect(mic!.y + mic!.height).toBeLessThanOrEqual(844);
    }
  }
  // Unmasked Home-only captures: no account identity, no magenta screenshot masks.
  await page.screenshot({ path: "/tmp/jarvis-phase8-mobile.png" });
  await page.locator(".j-home-actions").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/jarvis-phase8-mobile-actions.png" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator(".jarvis-home").screenshot({ path: "/tmp/jarvis-phase8-desktop.png" });
});

test("Phase 8 Home HUD reuses navigation, search composer and a single embedded map", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await prepare(page); await page.goto("/home");
  await page.getByRole("button", { name: "Open dashboard navigation", exact: true }).click();
  await expect(page.getByRole("button", { name: "HOME", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "HOME", exact: true }).click();
  await page.locator(".quick-grid").getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message JARVIS", exact: true })).toBeFocused();
  await expect(page.getByRole("region", { name: "Conversation", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close conversation", exact: true }).click();
  await expect(page.locator(".quick-grid").getByRole("link", { name: "Reminders", exact: true })).toHaveAttribute("href", "/personal");
  await expect(page.locator(".quick-grid").getByRole("link", { name: "Security", exact: true })).toHaveAttribute("href", "/settings#settings-privacy");
  for (const label of ["Camera", "Car", "Gmail", "Smart Home", "Alexa"]) await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  const canvas = page.locator("canvas.maplibregl-canvas");
  await expect(canvas).toHaveCount(1);
  await canvas.evaluate(e => e.setAttribute("data-same-map", "yes"));
  await page.getByRole("button", { name: "Open tactical map", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "JARVIS // TACTICAL MAP", exact: true });
  await expect(dialog).toBeVisible(); await expect(canvas).toHaveAttribute("data-same-map", "yes");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".j-home-map canvas")).toHaveAttribute("data-same-map", "yes");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("Phase 8 Home HUD retains projected core state and reduced-motion focus", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await prepare(page); await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/home");
  await expect(page.locator(".dashboard-hologram")).toHaveAttribute("data-state", "idle");
  await expect(page.locator(".hologram-live-status")).toHaveText("Ready — awaiting your next request.");
  const menu = page.getByRole("button", { name: "Open dashboard navigation", exact: true });
  await menu.focus(); await expect(menu).toBeFocused();
  expect(await menu.evaluate(e => getComputedStyle(e).transitionDuration)).toBe("0s");
  await menu.click(); await page.getByRole("button", { name: "Full Screen Focus", exact: true }).click();
  await expect(page.getByRole("region", { name: "Jarvis Focus Mode", exact: true })).toBeVisible();
});
