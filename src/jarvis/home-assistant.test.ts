/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../worker";
import { HomeAssistantProvider } from "./home-assistant";
import { handleHomeAssistant } from "./home-assistant-ledger";
import { homeActionSchema, publicHomeUrl } from "./home-assistant-contracts";
const token = "test-only-home-token";
const base = "https://home.example.com";
const states = [
  {
    entity_id: "light.bedroom",
    state: "off",
    attributes: {
      friendly_name: "Bedroom light",
      area_name: "Bedroom",
      supported_color_modes: ["color_temp"],
      brightness: 128,
      color_temp_kelvin: 2700,
      min_color_temp_kelvin: 2200,
      max_color_temp_kelvin: 6000,
    },
    last_updated: "2026-10-03T12:00:00Z",
  },
  {
    entity_id: "lock.front_door",
    state: "locked",
    attributes: { friendly_name: "Front door" },
    last_updated: "2026-10-03T12:00:00Z",
  },
  {
    entity_id: "climate.hall",
    state: "heat",
    attributes: {
      friendly_name: "Hall thermostat",
      supported_features: 1,
      temperature: 68,
      min_temp: 50,
      max_temp: 86,
    },
    last_updated: "2026-10-03T12:00:00Z",
  },
  {
    entity_id: "scene.good_night",
    state: "unknown",
    attributes: { friendly_name: "Good night" },
  },
  {
    entity_id: "switch.camera_privacy",
    state: "on",
    attributes: {
      friendly_name: "Camera privacy",
      access_token: "never-return",
      entity_picture: "http://192.168.1.2/secret",
    },
  },
  {
    entity_id: "light.hidden",
    state: "on",
    attributes: { friendly_name: "Unselected" },
  },
];
const policy = JSON.stringify([
  {
    entity: "light.bedroom",
    room: "Bedroom",
    actions: ["on", "off", "brightness", "color_temperature"],
  },
  { entity: "lock.front_door", actions: ["unlock"] },
  { entity: "climate.hall", actions: ["temperature"] },
  { entity: "scene.good_night", actions: ["scene"] },
  {
    entity: "switch.camera_privacy",
    category: "privacy",
    actions: ["on", "off"],
  },
]);
function mockHome() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/states") return Response.json(states);
    if (url.pathname === "/api/config")
      return Response.json({
        unit_system: { temperature: "°F" },
        internal_url: "http://192.168.1.2",
      });
    if (url.pathname.startsWith("/api/states/"))
      return Response.json(
        states.find(
          (state) =>
            state.entity_id ===
            decodeURIComponent(url.pathname.slice("/api/states/".length)),
        ),
      );
    if (url.pathname.startsWith("/api/services/")) return Response.json([]);
    throw new Error("unexpected-test-path");
  });
}
function ledger() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE approvals(token TEXT PRIMARY KEY,user_id TEXT,action TEXT,expires INTEGER,used INTEGER DEFAULT 0);CREATE TABLE audit(id TEXT,user_id TEXT,collection TEXT,record_id TEXT,created_at INTEGER,status TEXT)",
  );
  const sql = {
    exec(query: string, ...args: (string | number)[]) {
      const statement = db.prepare(query);
      const rows = /^SELECT/.test(query)
        ? statement.all(...args)
        : (statement.run(...args), []);
      return { toArray: () => rows };
    },
  } as unknown as SqlStorage;
  const env = {
    OWNER_USER_ID: "owner",
    HOME_ASSISTANT_URL: base,
    HOME_ASSISTANT_TOKEN: token,
    HOME_ASSISTANT_ALLOWED_DEVICES: policy,
  } as Env;
  return { sql, env, db };
}
describe("Home Assistant bridge", () => {
  it("permits only fixed public HTTPS URLs and normalized action schemas", () => {
    expect(publicHomeUrl(base)).toBe(base);
    for (const url of [
      "http://home.example.com",
      "https://192.168.1.2",
      "https://127.0.0.1",
      "https://2130706433",
      "https://[::1]",
      "https://home.local",
      "https://home.example.com:8060",
      "https://user:password@home.example.com",
      "https://home.example.com/?token=x",
    ])
      expect(() => publicHomeUrl(url)).toThrow();
    expect(
      homeActionSchema.safeParse({ deviceId: "light.bedroom", action: "on" })
        .success,
    ).toBe(false);
    expect(
      homeActionSchema.safeParse({
        deviceId: "ha-" + "a".repeat(24),
        action: "on",
        service: "shell_command.run",
      }).success,
    ).toBe(false);
    expect(
      homeActionSchema.safeParse({
        deviceId: "ha-" + "a".repeat(24),
        action: "purchase",
      }).success,
    ).toBe(false);
  });
  it("returns only chosen, normalized accessories without entity IDs, tokens or private URLs", async () => {
    const fetcher = mockHome();
    const provider = new HomeAssistantProvider(base, token, policy, fetcher);
    const devices = await provider.listDevices();
    expect(devices).toHaveLength(5);
    expect(devices.find((d) => d.name === "Bedroom light")).toMatchObject({
      room: "Bedroom",
      type: "light",
      online: true,
      brightness: 50,
    });
    expect(devices.find((d) => d.name === "Good night")).toMatchObject({
      online: true,
      confirmationActions: ["scene"],
    });
    const serialized = JSON.stringify(devices);
    for (const secret of [
      "light.bedroom",
      "192.168",
      "access_token",
      "never-return",
      token,
      "Unselected",
    ])
      expect(serialized).not.toContain(secret);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      headers: { Authorization: `Bearer ${token}` },
    });
  });
  it("enforces capabilities, saved permissions and exact bounded service mappings", async () => {
    const fetcher = mockHome();
    const provider = new HomeAssistantProvider(base, token, policy, fetcher);
    const devices = await provider.listDevices();
    const light = devices.find((d) => d.type === "light")!;
    await provider.execute({
      deviceId: light.id,
      action: "brightness",
      value: 30,
    });
    const posted = fetcher.mock.calls.find(([url]) =>
      String(url).endsWith("/api/services/light/turn_on"),
    )!;
    expect(JSON.parse(posted[1]!.body as string)).toEqual({
      entity_id: "light.bedroom",
      brightness_pct: 30,
    });
    await expect(
      provider.execute({
        deviceId: light.id,
        action: "color_temperature",
        value: 6500,
      }),
    ).rejects.toThrow("home_assistant_invalid_value");
    const thermostat = devices.find((d) => d.type === "thermostat")!;
    await provider.execute({
      deviceId: thermostat.id,
      action: "temperature",
      value: 20,
      unit: "C",
    });
    const climatePost = fetcher.mock.calls.find(([url]) =>
      String(url).endsWith("/api/services/climate/set_temperature"),
    )!;
    expect(JSON.parse(climatePost[1]!.body as string)).toEqual({
      entity_id: "climate.hall",
      temperature: 68,
    });
    await expect(
      new HomeAssistantProvider(base, token, "[]", fetcher).execute({
        deviceId: light.id,
        action: "on",
      }),
    ).rejects.toThrow("home_assistant_device_not_found");
    const lock = devices.find((d) => d.type === "lock")!;
    await expect(
      provider.execute({ deviceId: lock.id, action: "unlock" }),
    ).rejects.toThrow("home_assistant_confirmation_required");
  });
  it("binds sensitive approval to user, device, exact parameters and configuration; cancel and replay fail", async () => {
    const { sql, env, db } = ledger();
    const fetcher = mockHome();
    vi.stubGlobal("fetch", fetcher);
    try {
      const provider = new HomeAssistantProvider(base, token, policy);
      const lock = (await provider.listDevices()).find(
        (d) => d.type === "lock",
      )!;
      const requested = (await (
        await handleHomeAssistant(sql, env, {
          userId: "owner",
          operation: "home_action",
          action: { deviceId: lock.id, action: "unlock" },
        })
      ).json()) as { token: string; status: string };
      expect(requested.status).toBe("confirmation_required");
      expect(
        fetcher.mock.calls.filter(([url]) =>
          String(url).includes("/services/"),
        ),
      ).toHaveLength(0);
      expect(
        (
          await handleHomeAssistant(sql, env, {
            userId: "other",
            operation: "home_approve",
            token: requested.token,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await handleHomeAssistant(
            sql,
            { ...env, HOME_ASSISTANT_TOKEN: "rotated-test-token" },
            {
              userId: "owner",
              operation: "home_approve",
              token: requested.token,
            },
          )
        ).status,
      ).toBe(409);
      const results = await Promise.all(
        [1, 2].map(() =>
          handleHomeAssistant(sql, env, {
            userId: "owner",
            operation: "home_approve",
            token: requested.token,
          }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        fetcher.mock.calls.filter(([url]) =>
          String(url).includes("/services/lock/unlock"),
        ),
      ).toHaveLength(1);
      const cancelled = (await (
        await handleHomeAssistant(sql, env, {
          userId: "owner",
          operation: "home_action",
          action: { deviceId: lock.id, action: "unlock" },
        })
      ).json()) as { token: string };
      await handleHomeAssistant(sql, env, {
        userId: "owner",
        operation: "home_cancel",
        token: cancelled.token,
      });
      expect(
        (
          await handleHomeAssistant(sql, env, {
            userId: "owner",
            operation: "home_approve",
            token: cancelled.token,
          })
        ).status,
      ).toBe(409);
      await handleHomeAssistant(sql, env, {
        userId: "owner",
        operation: "home_disconnect",
      });
      expect(
        (
          await handleHomeAssistant(sql, env, {
            userId: "owner",
            operation: "home_devices",
          })
        ).status,
      ).toBe(409);
    } finally {
      vi.unstubAllGlobals();
      db.close();
    }
  });
  it("returns safe provider errors without raw credentials or provider error contents", async () => {
    const { sql, env, db } = ledger();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("raw token " + token + " private http://192.168.1.2", {
          status: 401,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    try {
      const response = await handleHomeAssistant(sql, env, {
        userId: "owner",
        operation: "home_devices",
      });
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(text).not.toContain(token);
      expect(text).not.toContain("192.168");
    } finally {
      vi.unstubAllGlobals();
      db.close();
    }
  });
});
