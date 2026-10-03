/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, vi } from "vitest";
import { handleNativeHome } from "./native-home-ledger";
import { nativeAuditSchema, localManifestSchema } from "./native-home-audit";
function ledger() {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(query: string, ...args: (string | number)[]) {
      const statement = db.prepare(query);
      const rows = /^SELECT/.test(query)
        ? statement.all(...args)
        : (statement.run(...args), []);
      return { toArray: () => rows };
    },
  } as unknown as SqlStorage;
  return { sql, db };
}
const event = {
  deviceName: "Living Room Lamp",
  actionType: "power_on",
  state: "completed",
  timestamp: new Date().toISOString(),
  message: "Verified on by Apple Home readback.",
};
describe("native HomeKit boundary", () => {
  it("rejects raw metadata, private material, unsafe actions and invalid dates", () => {
    expect(nativeAuditSchema.safeParse(event).success).toBe(true);
    for (const bad of [
      { ...event, homeKitId: crypto.randomUUID() },
      { ...event, deviceName: "192.168.1.89" },
      { ...event, message: "pairing=123-45-678" },
      { ...event, actionType: "unlock" },
      { ...event, timestamp: "tomorrow" },
      { ...event, message: "http://localhost" },
    ])
      expect(nativeAuditSchema.safeParse(bad).success).toBe(false);
    expect(
      localManifestSchema.safeParse({
        actions: [
          {
            actionId: crypto.randomUUID(),
            deviceName: "Camera",
            actionType: "disarm_alarm",
            label: "Disarm",
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("isolates and deduplicates sanitized audits by authenticated user", async () => {
    const { sql, db } = ledger(),
      id = crypto.randomUUID();
    expect(
      handleNativeHome(sql, {
        userId: "a",
        operation: "native_home_audit",
        token: id,
        action: event,
      }).status,
    ).toBe(200);
    expect(
      handleNativeHome(sql, {
        userId: "a",
        operation: "native_home_audit",
        token: id,
        action: event,
      }).status,
    ).toBe(200);
    expect(
      handleNativeHome(sql, {
        userId: "a",
        operation: "native_home_audit",
        token: id,
        action: { ...event, state: "failed" },
      }).status,
    ).toBe(409);
    const a = (await handleNativeHome(sql, {
      userId: "a",
      operation: "native_home_audits",
    }).json()) as { events: unknown[] };
    const b = (await handleNativeHome(sql, {
      userId: "b",
      operation: "native_home_audits",
    }).json()) as { events: unknown[] };
    expect(a.events).toHaveLength(1);
    expect(b.events).toHaveLength(0);
    db.close();
  });
  it("queues only registered exact actions, claims once and expires without execution", async () => {
    const { sql, db } = ledger(),
      actionId = crypto.randomUUID();
    const manifest = {
      actions: [
        {
          actionId,
          deviceName: "Lamp",
          actionType: "power_on",
          label: "Turn on",
        },
      ],
    };
    expect(
      handleNativeHome(sql, {
        userId: "a",
        operation: "native_home_manifest",
        action: manifest,
      }).status,
    ).toBe(200);
    expect(
      handleNativeHome(sql, {
        userId: "b",
        operation: "native_home_request",
        action: { actionId },
      }).status,
    ).toBe(422);
    expect(
      handleNativeHome(sql, {
        userId: "a",
        operation: "native_home_request",
        action: { actionId, url: "http://192.168.1.2" },
      }).status,
    ).toBe(422);
    const queued = (await handleNativeHome(sql, {
      userId: "a",
      operation: "native_home_request",
      action: { actionId },
    }).json()) as { executed: boolean };
    expect(queued.executed).toBe(false);
    expect(
      (
        (await handleNativeHome(sql, {
          userId: "a",
          operation: "native_home_poll",
        }).json()) as { request: unknown }
      ).request,
    ).not.toBeNull();
    expect(
      (
        (await handleNativeHome(sql, {
          userId: "a",
          operation: "native_home_poll",
        }).json()) as { request: unknown }
      ).request,
    ).toBeNull();
    handleNativeHome(sql, {
      userId: "a",
      operation: "native_home_request",
      action: { actionId },
    });
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61000);
    try {
      expect(
        (
          (await handleNativeHome(sql, {
            userId: "a",
            operation: "native_home_poll",
          }).json()) as { request: unknown }
        ).request,
      ).toBeNull();
    } finally {
      vi.restoreAllMocks();
      db.close();
    }
  });
});
