import { describe, expect, it, vi } from "vitest";
import { readHomeDashboard, selectDashboardTV } from "./home-dashboard";
import type { HomeDevice } from "../../jarvis/home-assistant-contracts";

const tv: HomeDevice = {
  id: "ha-" + "a".repeat(24),
  name: "Living room TCL Roku TV",
  room: "Living room",
  type: "media",
  online: true,
  state: "off",
  lastUpdated: "2026-10-04T12:00:00.000Z",
  actions: ["on", "off"],
  confirmationActions: ["off"],
};
describe("authenticated dashboard Home Assistant reads", () => {
  it("shows the approved provider state and read timestamp without executing a command", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ available: true, enabled: true }))
      .mockResolvedValueOnce(Response.json({ connected: true, devices: [tv] }));
    const snapshot = await readHomeDashboard(fetcher);
    expect(snapshot).toMatchObject({ phase: "connected", tv });
    expect(Date.parse(snapshot.retrievedAt!)).toBeGreaterThan(0);
    expect(snapshot.tv?.lastUpdated).toBe(tv.lastUpdated);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "/api/jarvis/connections/home-assistant/config",
      "/api/jarvis/connections/home-assistant/devices",
    ]);
    expect(fetcher.mock.calls.every((call) => call[1] === undefined)).toBe(
      true,
    );
  });
  it.each([
    [{ available: false, enabled: true }, 409, "not_configured"],
    [{ available: true, enabled: false }, 200, "disabled"],
    [{ error: "owner_home_only" }, 403, "forbidden"],
  ])(
    "does not fetch devices for unavailable configurations (%s)",
    async (body, status, phase) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(Response.json(body, { status }));
      expect(await readHomeDashboard(fetcher)).toEqual({
        phase,
        devices: [],
        tv: null,
        retrievedAt: null,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("clears data on an unreachable provider and rejects malformed device responses", async () => {
    for (const response of [
      Response.json({ error: "home_assistant_unavailable" }, { status: 502 }),
      Response.json({
        connected: true,
        devices: [{ ...tv, id: "private-entity-id" }],
      }),
    ]) {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ available: true, enabled: true }),
        )
        .mockResolvedValueOnce(response);
      expect(await readHomeDashboard(fetcher)).toEqual({
        phase: "unavailable",
        devices: [],
        tv: null,
        retrievedAt: null,
      });
    }
  });
  it("does not infer a television from an arbitrary speaker or select between ambiguous TVs", () => {
    expect(selectDashboardTV([{ ...tv, name: "Kitchen speaker" }])).toBeNull();
    expect(
      selectDashboardTV([
        tv,
        { ...tv, id: "ha-" + "b".repeat(24), name: "Bedroom Roku TV" },
      ]),
    ).toBeNull();
    expect(
      selectDashboardTV([tv, { ...tv, type: "light", name: "TCL light" }]),
    ).toEqual(tv);
  });
  it("keeps offline TV state offline rather than inventing connected power status", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ available: true, enabled: true }))
      .mockResolvedValueOnce(
        Response.json({
          connected: true,
          devices: [{ ...tv, online: false, state: "unavailable" }],
        }),
      );
    expect((await readHomeDashboard(fetcher)).tv).toMatchObject({
      online: false,
      state: "unavailable",
    });
  });
});
