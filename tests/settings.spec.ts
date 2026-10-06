import { mockHomeMapTiles } from "./helpers/home-controls";
import { expect, loadAllTestAccounts, test } from "deepspace/testing";
import type { Page } from "@playwright/test";

test.skip(loadAllTestAccounts().length < 1, "Requires test account");
async function checks(page: Page) {
  await mockHomeMapTiles(page);
  await page.route("**/api/health", r => r.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/jarvis/connections/home-assistant/config", r => r.fulfill({ json: { enabled: false, available: false } }));
  await page.route("**/api/jarvis/connections/weather", r => r.fulfill({ json: { location: "Test location", temperature: 70, feelsLike: 68, retrievedAt: "2026-10-05T12:00:00Z", description: "Clear" } }));
}

test("Settings redesign preserves stored preferences, proactive policy, and session voice values", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await checks(page); await page.goto("/settings");
  await page.getByLabel("Your timezone").fill("America/Chicago");
  await page.getByLabel("technical", { exact: true }).check();
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByText("Preferences saved.", { exact: true })).toBeVisible();
  await page.getByLabel("Daily briefing", { exact: true }).selectOption("off");
  await page.getByLabel("Weather alerts", { exact: true }).selectOption("off");
  await page.getByLabel("Quiet hours start", { exact: true }).fill("21:00");
  await page.getByRole("button", { name: "Save proactive preferences", exact: true }).click();
  await expect(page.getByText("Preferences saved. Scheduled proactive services are not active yet.", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Speak replies", exact: true }).check();
  await page.getByLabel("Voice speed", { exact: true }).selectOption("fast");
  await page.reload();
  await expect(page.getByLabel("Your timezone")).toHaveValue("America/Chicago");
  await expect(page.getByLabel("technical", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Daily briefing", { exact: true })).toHaveValue("off");
  await expect(page.getByLabel("Weather alerts", { exact: true })).toHaveValue("off");
  await expect(page.getByLabel("Quiet hours start", { exact: true })).toHaveValue("21:00");
  await expect(page.getByRole("checkbox", { name: "Speak replies", exact: true })).toBeChecked();
  await expect(page.getByLabel("Voice speed", { exact: true })).toHaveValue("fast");
  // Restore the existing default session voice behavior for subsequent checks.
  await page.getByRole("checkbox", { name: "Speak replies", exact: true }).uncheck();
  await page.getByLabel("Voice speed", { exact: true }).selectOption("normal");
});

test("Settings redesign iPhone layout has touch targets and no horizontal overflow or fabricated controls", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await checks(page); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  for (const title of ["General", "Voice & Speech", "Talk Mode", "Wake JARVIS", "Location & Maps", "Connected Devices", "Notifications", "Interface", "Privacy & Security", "System"]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(1);
  }
  await expect(page.locator("#settings-location").getByRole("button", { name: "Open tactical map", exact: true })).toBeVisible();
  await expect(page.locator("#settings-devices")).not.toContainText("Verified online");
  await expect(page.locator("#settings-devices")).toContainText("Smart HomeNot connected");
  await expect(page.getByRole("button", { name: "Enable “Hey Jarvis”", exact: true })).toHaveCount(0);
  await expect(page.getByText("Gmail", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Daily briefing preview", exact: true })).toHaveCount(0);
  for (const width of [390, 320, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const undersized = await page.locator(".jarvis-settings a:visible, .jarvis-settings button:visible, .jarvis-settings select:visible, .jarvis-settings summary:visible, .settings-toggle-row").evaluateAll(elements => elements.filter(e => e.getBoundingClientRect().height < 44).map(e => e.textContent));
    expect(undersized).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/jarvis-settings-mobile.png", fullPage: true, mask: [page.locator("#settings-privacy"), page.getByTestId("app-navigation")] });
});

test("Settings redesign disclosure rows open existing routes and keep shared system health", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await checks(page); await page.goto("/settings");
  await expect(page.getByRole("region", { name: "System health", exact: true })).toContainText("Location map · disabled");
  for (const [name, suffix] of [["Default weather city", "location"], ["TV", "apps"], ["Music", "music"], ["Smart Home", "home"]]) {
    await page.getByRole("link", { name: new RegExp(`^${name}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/connections\\?tab=${suffix}$`));
    await page.goto("/settings");
  }
  await page.getByRole("link", { name: "Cinematic Focus Open", exact: true }).click();
  await expect(page.getByRole("region", { name: "Jarvis Focus Mode", exact: true })).toBeVisible();
});

test("Settings redesign desktop navigation and reduced motion retain keyboard focus", async ({ users }) => {
  const [user] = await users(1); const page = user.page;
  await checks(page); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings");
  const nav = page.getByRole("navigation", { name: "Settings sections", exact: true });
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Voice & Speech", exact: true }).click();
  await expect(page).toHaveURL(/#settings-voice$/);
  await page.getByRole("button", { name: "Test Device Voice", exact: true }).focus();
  await expect(page.getByRole("button", { name: "Test Device Voice", exact: true })).toBeFocused();
  expect(await page.locator(".settings-toggle-row input").evaluate(e => getComputedStyle(e, "::after").transitionDuration)).toBe("0s");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/settings");
  await page.screenshot({ path: "/tmp/jarvis-settings-desktop.png", fullPage: true, mask: [page.locator("#settings-privacy"), page.getByTestId("app-navigation")] });
});
