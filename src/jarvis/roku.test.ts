/// <reference types="node" />
import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { Env } from "../../worker";
import {
  RokuProvider,
  privateRokuIp,
  rokuAction,
  allowedRokuApps,
} from "./roku";
import { handleRoku } from "./roku-ledger";
function ledger() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE approvals(token TEXT PRIMARY KEY,user_id TEXT,action TEXT,expires INTEGER,used INTEGER DEFAULT 0); CREATE TABLE audit(id TEXT,user_id TEXT,collection TEXT,record_id TEXT,created_at INTEGER,status TEXT)",
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
  return {
    sql,
    env: { OWNER_USER_ID: "owner", ROKU_TV_IP: "192.168.1.89" } as Env,
    db,
  };
}
describe("Roku ECP security", () => {
  it("accepts only fixed private IPv4 configuration, allow-listed keys and bounded volume", () => {
    expect(privateRokuIp("192.168.1.89")).toBe(true);
    for (const ip of [
      "127.0.0.1",
      "169.254.169.254",
      "8.8.8.8",
      "192.168.1.89:9000",
      "192.168.1.89/evil",
      "localhost",
      "192.168.1.999",
    ])
      expect(privateRokuIp(ip)).toBe(false);
    expect(
      rokuAction.safeParse({ tool: "roku_keypress", key: "PowerOff" }).success,
    ).toBe(false);
    expect(
      rokuAction.safeParse({
        tool: "roku_keypress",
        key: "Home",
        url: "http://evil",
      }).success,
    ).toBe(false);
    expect(
      rokuAction.safeParse({
        tool: "roku_set_volume",
        direction: "down",
        steps: 6,
      }).success,
    ).toBe(false);
    expect(allowedRokuApps('[{"id":"../admin","name":"Netflix"}]')).toEqual([]);
  });
  it("uses only the configured ECP origin and never follows redirects or unknown apps", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          "<device-info><model-name>TCL</model-name><power-mode>PowerOn</power-mode></device-info>",
        ),
      );
    const provider = new RokuProvider(
      "192.168.1.89",
      [{ id: "12", name: "Netflix" }],
      fetcher,
    );
    expect((await provider.status()).online).toBe(true);
    await provider.keypress("Home");
    await provider.launch("12");
    await expect(provider.launch("99")).rejects.toThrow("roku_app_not_allowed");
    await expect(provider.keypress("Home/PowerOff")).rejects.toThrow();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "http://192.168.1.89:8060/query/device-info",
      "http://192.168.1.89:8060/keypress/Home",
      "http://192.168.1.89:8060/launch/12",
    ]);
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      method: "POST",
      redirect: "error",
    });
  });
  it("reports partial volume execution without retrying and rejects invalid XML", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response())
      .mockRejectedValueOnce(new Error("offline"));
    expect(
      await new RokuProvider("192.168.1.89", [], fetcher).volume("down", 3),
    ).toMatchObject({ accepted: false, completedSteps: 1, retrySafe: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(
      new RokuProvider(
        "192.168.1.89",
        [],
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response("<!DOCTYPE device-info><device-info/>"),
          ),
      ).status(),
    ).rejects.toThrow();
  });
  it("requires user-bound, exact-device, unexpired, single-use power approval", async () => {
    const { sql, env, db } = ledger();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetcher);
    try {
      expect(
        (
          await handleRoku(sql, env, {
            userId: "other",
            operation: "roku_power_request",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await handleRoku(sql, env, {
            userId: "owner",
            operation: "roku_execute",
            action: { tool: "roku_power_off" },
          })
        ).status,
      ).toBe(422);
      const requested = (await (
        await handleRoku(sql, env, {
          userId: "owner",
          operation: "roku_power_request",
        })
      ).json()) as { token: string };
      expect(fetcher).not.toHaveBeenCalled();
      expect(
        (
          await handleRoku(
            sql,
            { ...env, ROKU_TV_IP: "192.168.1.90" },
            {
              userId: "owner",
              operation: "roku_power_approve",
              token: requested.token,
            },
          )
        ).status,
      ).toBe(409);
      const results = await Promise.all(
        [1, 2].map(() =>
          handleRoku(sql, env, {
            userId: "owner",
            operation: "roku_power_approve",
            token: requested.token,
          }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(fetcher).toHaveBeenCalledTimes(1);
      const expired = (await (
        await handleRoku(sql, env, {
          userId: "owner",
          operation: "roku_power_request",
        })
      ).json()) as { token: string };
      db.prepare("UPDATE approvals SET expires=0 WHERE token=?").run(
        expired.token,
      );
      expect(
        (
          await handleRoku(sql, env, {
            userId: "owner",
            operation: "roku_power_approve",
            token: expired.token,
          })
        ).status,
      ).toBe(409);
      await handleRoku(sql, env, {
        userId: "owner",
        operation: "roku_disconnect",
      });
      expect(
        (
          await handleRoku(sql, env, {
            userId: "owner",
            operation: "roku_execute",
            action: { tool: "roku_keypress", key: "Home" },
          })
        ).status,
      ).toBe(409);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      db.close();
    }
  });
});
