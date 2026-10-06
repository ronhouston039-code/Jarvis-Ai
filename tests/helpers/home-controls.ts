import { expect, type Page } from "@playwright/test";
/** Home voice controls now live in the existing command-center menu. */
export async function openHomeMenu(page: Page) {
  const menu = page.getByRole("dialog", { name: "JARVIS menu", exact: true });
  const trigger = page.locator('button[aria-label="Open dashboard navigation"]');
  if (await trigger.getAttribute("aria-expanded") !== "true") {
    await expect(menu).not.toBeVisible();
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toBeVisible();
}
/** Explicit external tile mock keeps unrelated voice/health checks offline. */
export async function mockHomeMapTiles(page: Page) {
  await page.route("https://tiles.openfreemap.org/**", route => route.request().url().endsWith("/planet")
    ? route.fulfill({ json: { tilejson: "3.0.0", tiles: ["https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14, attribution: "OpenFreeMap · OpenStreetMap contributors" } })
    : route.fulfill({ contentType: "application/x-protobuf", body: Buffer.alloc(0) }));
}

export async function openHomeActivity(page: Page) {
  const activity = page.getByRole("region", { name: "JARVIS activity and controls", exact: true });
  if (!await activity.isVisible()) await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(activity).toBeVisible();
}
