import { test, expect } from "@playwright/test";

test.describe("API tests", () => {
  test("auth proxy forwards to auth worker", async ({ request }) => {
    const res = await request.get("/api/auth/ok");
    expect(res.ok()).toBeTruthy();
  });

  test("WebSocket endpoint exists", async ({ page }) => {
    // /home is a dynamic page (under src/pages/(app)/), so mounting it boots
    // the providers and auto-connects the records WebSocket. The static
    // landing at '/' deliberately does neither — see smoke.spec.ts.
    await page.goto("/home");
    // Wait for the app to connect its WebSocket (it auto-connects on mount)
    await page.waitForSelector('[data-testid="app-navigation"]', {
      timeout: 15000,
    });
    // If the app loaded and connected, the WS endpoint works
  });
});

test("JARVIS refuses unauthenticated writes and voice", async ({ request }) => {
  for (const path of [
    "reminders",
    "memories",
    "confirmations/request",
    "confirmations/approve",
    "voice/speak",
    "voice/transcribe",
  ]) {
    const result = await request.post(`/api/jarvis/${path}`, { data: {} });
    expect(result.status()).toBe(401);
  }
  expect(
    (await request.post("/api/tts", { data: { text: "Hello" } })).status(),
  ).toBe(401);
  expect((await request.get("/api/jarvis/capabilities")).status()).toBe(401);
});

test("Roku routes reject anonymous callers", async ({ request }) => {
  expect(
    (await request.get("/api/jarvis/connections/roku/status")).status(),
  ).toBe(401);
  for (const suffix of [
    "action",
    "power/request",
    "power/approve",
    "disconnect",
  ])
    expect(
      (
        await request.post("/api/jarvis/connections/roku/" + suffix, {
          data: {},
        })
      ).status(),
    ).toBe(401);
});

test("Native HomeKit and Home Assistant routes reject anonymous access", async ({
  request,
}) => {
  for (const path of [
    "/api/homekit/audit",
    "/api/homekit/actions",
    "/api/jarvis/connections/home-assistant/config",
    "/api/jarvis/connections/home-assistant/devices",
  ])
    expect((await request.get(path)).status()).toBe(401);
  for (const path of [
    "/api/homekit/audit",
    "/api/homekit/actions",
    "/api/homekit/requests",
    "/api/homekit/poll",
    "/api/jarvis/connections/home-assistant/action",
    "/api/jarvis/connections/home-assistant/approve",
  ])
    expect((await request.post(path, { data: {} })).status()).toBe(401);
});
