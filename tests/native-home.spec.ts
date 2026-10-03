import { test, expect, loadAllTestAccounts } from "deepspace/testing";
test.skip(
  loadAllTestAccounts().length < 2,
  "Requires two configured DeepSpace test accounts.",
);
test("authenticated native handoff and audit stay isolated and validate payloads", async ({
  users,
}) => {
  const [a, b] = await users(2);
  await Promise.all([a.page.goto("/home"), b.page.goto("/home")]);
  const key = crypto.randomUUID();
  await a.page.route("**/api/homekit/audit", (route) =>
    route.continue({
      headers: { ...route.request().headers(), "Idempotency-Key": key },
    }),
  );
  const call = (page: typeof a.page, path: string, body?: unknown) =>
    page.evaluate(
      async ({ path, body }) => {
        const modulePath = "/src/jarvis/client.ts";
        const module = await import(modulePath);
        const response = await module.authenticatedFetch(path, body);
        return { status: response.status, data: await response.json() };
      },
      { path, body },
    );
  const event = {
    deviceName: "__test Native Lamp",
    actionType: "power_on",
    state: "completed",
    timestamp: new Date().toISOString(),
    message: "Verified on by Apple Home readback.",
  };
  expect(
    (
      await call(a.page, "/api/homekit/audit", {
        ...event,
        homeKitId: crypto.randomUUID(),
      })
    ).status,
  ).toBe(422);
  expect((await call(a.page, "/api/homekit/audit", event)).status).toBe(200);
  expect((await call(a.page, "/api/homekit/audit", event)).status).toBe(200);
  expect(
    (await call(a.page, "/api/homekit/audit", { ...event, state: "failed" }))
      .status,
  ).toBe(409);
  const events = (await call(a.page, "/api/homekit/audit")).data.events;
  expect(events.filter((e: { id: string }) => e.id === key)).toHaveLength(1);
  expect(
    (await call(b.page, "/api/homekit/audit")).data.events.some(
      (e: { id: string }) => e.id === key,
    ),
  ).toBe(false);
  const actionId = crypto.randomUUID();
  expect(
    (
      await call(a.page, "/api/homekit/actions", {
        actions: [
          {
            actionId,
            deviceName: "Test Lamp",
            actionType: "power_on",
            label: "Turn on",
          },
        ],
      })
    ).status,
  ).toBe(200);
  expect(
    (await call(b.page, "/api/homekit/requests", { actionId })).status,
  ).toBe(422);
  const queued = await call(a.page, "/api/homekit/requests", { actionId });
  expect(queued.data.executed).toBe(false);
  expect(queued.data.status).toBe("queued");
  expect(
    (await call(a.page, "/api/homekit/poll", {})).data.request.actionId,
  ).toBe(actionId);
  expect((await call(a.page, "/api/homekit/poll", {})).data.request).toBeNull();
  expect(
    (await call(a.page, "/api/homekit/actions", { actions: [] })).status,
  ).toBe(200);
});
