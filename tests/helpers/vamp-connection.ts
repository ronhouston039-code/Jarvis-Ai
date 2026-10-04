import { expect } from "deepspace/testing";
import type { Page } from "@playwright/test";

export const SAVED_VAMP_SHORTCUT = "Vamp iPhone & Music";
export const SAVED_VAMP_URL =
  "shortcuts://run-shortcut?name=Vamp%20iPhone%20%26%20Music";
const saved: Array<{ page: Page; recordId: string }> = [];

/** Create the same persisted connection that the Connections Play link uses. */
export async function saveVampConnection(page: Page) {
  const pauseName = `Test pause ${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pauseUrl = `shortcuts://run-shortcut?name=${encodeURIComponent(pauseName)}`;
  await page.goto("/connections?tab=music");
  await page
    .getByRole("textbox", { name: "Device display name" })
    .fill("Play Vamp");
  await page
    .getByRole("textbox", { name: "On shortcut name" })
    .fill(SAVED_VAMP_SHORTCUT);
  await page
    .getByRole("textbox", { name: "Off shortcut name" })
    .fill(pauseName);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/jarvis/connections/devices") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  const result = await response;
  expect(result.ok()).toBe(true);
  const body = await result.json();
  saved.push({ page, recordId: body.data.record.recordId });
  const cards = page.locator("section.personal-card").filter({
    has: page.getByRole("heading", { name: "Play Vamp", exact: true }),
  });
  const pause = page.locator(`a[href="${pauseUrl}"]`);
  const card = cards.filter({ has: pause });
  await expect(card).toBeVisible();
  // Clear leftovers from interrupted runs, using the normal owned connection API.
  const previous = cards.filter({ hasNot: pause });
  while (await previous.count()) {
    const count = await previous.count();
    await previous
      .first()
      .getByRole("button", { name: "Remove connection", exact: true })
      .click();
    await expect(previous).toHaveCount(count - 1);
  }
  await expect(cards).toHaveCount(1);
  await expect(
    card.getByRole("link", { name: "Play", exact: true }),
  ).toHaveAttribute("href", SAVED_VAMP_URL);
}

export async function cleanupVampConnections() {
  for (const { page, recordId } of saved.splice(0)) {
    if (page.isClosed()) continue;
    const status = await page.evaluate(async (id) => {
      const modulePath = "/src/jarvis/client.ts";
      const { authenticatedFetch } = await import(modulePath);
      const response = await authenticatedFetch(
        "/api/jarvis/connections/disable",
        {
          collection: "device-shortcuts",
          recordId: id,
        },
      );
      return response.status;
    }, recordId);
    expect(status).toBe(200);
  }
}
