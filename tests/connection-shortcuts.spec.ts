import { expect, loadAllTestAccounts, test } from "deepspace/testing";
import { cleanupVampConnections, saveVampConnection, SAVED_VAMP_SHORTCUT, SAVED_VAMP_URL } from "./helpers/vamp-connection";
test.skip(loadAllTestAccounts().length < 1, "Requires test account");
test.afterEach(cleanupVampConnections);
async function prepare(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1" });
    Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
    const w = window as unknown as { phase7Launches: unknown[] }; w.phase7Launches = [];
    for (const type of ["jarvis-music-shortcut-launch", "jarvis-connection-shortcut-launch"]) window.addEventListener(type, event => { event.preventDefault(); w.phase7Launches.push((event as CustomEvent).detail); });
  });
}
const launches = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { phase7Launches: unknown[] }).phase7Launches);
test("Phase 7 Connections Play Vamp reuses saved review, cancel and dispatch evidence", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await prepare(page); await saveVampConnection(page);
  const card = page.locator("section.personal-card").filter({ has: page.getByRole("heading", { name: "Play Vamp", exact: true }) });
  await card.getByRole("button", { name: "Play", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Play Vamp", exact: true });
  await expect(review).toContainText(SAVED_VAMP_SHORTCUT); expect(await launches(page)).toEqual([]);
  await review.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(review).toHaveCount(0); expect(await launches(page)).toEqual([]);
  await expect(page.getByText("Playback requested — awaiting confirmation", { exact: true })).toHaveCount(0);
  await card.getByRole("button", { name: "Play", exact: true }).click(); await review.getByRole("button", { name: "Send Play Request", exact: true }).click();
  expect(await launches(page)).toEqual([{ name: SAVED_VAMP_SHORTCUT, url: SAVED_VAMP_URL }]);
  await expect(page.getByText("Playback requested — awaiting confirmation", { exact: true })).toBeVisible();
  await page.goto("/home"); await expect(page.getByText("Apple Music request dispatched: Play Vamp", { exact: true })).toBeVisible();
  await expect(page.getByText("Playing: Vamp", { exact: true })).toHaveCount(0);
});
test("Phase 7 saved device Shortcut review cancels cleanly and dispatches exact configured name once", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await prepare(page); await page.goto("/connections?tab=home");
  const name = `Phase 7 Lamp ${Date.now()}`;
  await page.getByRole("textbox", { name: "Device display name", exact: true }).fill(name);
  await page.getByRole("combobox", { name: "Device type", exact: true }).selectOption("light");
  await page.getByRole("textbox", { name: "On shortcut name", exact: true }).fill("Lamp On & Review");
  await page.getByRole("button", { name: "Add connection", exact: true }).click();
  const card = page.locator("section.personal-card").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await card.getByRole("button", { name: "Turn on", exact: true }).click(); const review = page.getByRole("dialog", { name: "Review Shortcut request", exact: true });
  await expect(review).toContainText("Lamp On & Review"); expect(await launches(page)).toEqual([]);
  await review.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(review).toHaveCount(0); expect(await launches(page)).toEqual([]);
  await card.getByRole("button", { name: "Turn on", exact: true }).click(); await review.getByRole("button", { name: "Send Request", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  expect(await launches(page)).toEqual([{ name, url: "shortcuts://run-shortcut?name=Lamp%20On%20%26%20Review" }]);
  await expect(page.getByRole("status").filter({ hasText: `Shortcut request dispatched: ${name}` })).toContainText("Completion unverified");
  await expect(review).toHaveCount(0);
  await card.getByRole("button", { name: "Remove connection", exact: true }).click(); await expect(card).toHaveCount(0);
});

test("Phase 7 stale saved Shortcut review cannot dispatch a removed connection", async ({ users }) => {
  const [user] = await users(1); const page = user.page; await prepare(page); await page.goto("/connections?tab=home");
  const name = `Phase 7 Stale ${Date.now()}`;
  await page.getByRole("textbox", { name: "Device display name", exact: true }).fill(name);
  await page.getByRole("combobox", { name: "Device type", exact: true }).selectOption("light");
  await page.getByRole("textbox", { name: "On shortcut name", exact: true }).fill("Exact Saved Lamp Shortcut");
  const saving = page.waitForResponse(r => r.url().endsWith("/api/jarvis/connections/devices") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Add connection", exact: true }).click();
  const body = await (await saving).json();
  const card = page.locator("section.personal-card").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await card.getByRole("button", { name: "Turn on", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review Shortcut request", exact: true });
  await expect(review).toContainText("Exact Saved Lamp Shortcut");
  const status = await page.evaluate(async id => {
    const modulePath = "/src/jarvis/client.ts";
    const { authenticatedFetch } = await import(modulePath);
    return (await authenticatedFetch("/api/jarvis/connections/disable", { collection: "device-shortcuts", recordId: id })).status;
  }, body.data.record.recordId);
  expect(status).toBe(200);
  await expect(review.getByRole("alert")).toContainText("saved connection changed or is unavailable");
  await expect(review.getByRole("button", { name: "Send Request", exact: true })).toBeDisabled();
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await launches(page)).toEqual([]);
  await expect(page.getByRole("status").filter({ hasText: `Shortcut request dispatched: ${name}` })).toHaveCount(0);
});
