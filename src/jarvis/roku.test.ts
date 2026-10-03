/// <reference types="node" />
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../worker";
import {
  RokuProvider,
  privateRokuIp,
  rokuAction,
  allowedRokuApps,
} from "./roku";
import { handleRoku } from "./roku-ledger";
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
  it("blocks every legacy cloud Roku request without contacting a private address", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const sql = {} as SqlStorage;
    const env = { OWNER_USER_ID: "owner", ROKU_TV_IP: "192.168.1.89" } as Env;
    try {
      expect((await handleRoku(sql, env, { userId: "other" })).status).toBe(
        403,
      );
      expect(
        (
          await handleRoku(sql, env, {
            userId: "owner",
            operation: "roku_power_approve",
            token: "old",
          })
        ).status,
      ).toBe(409);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
