import { describe, expect, it, vi } from "vitest";
vi.mock("deepspace", () => ({ useAuthProfileReady: vi.fn() }));
import {
  canConfirmTVResult,
  isIOSSafari,
  launchTVShortcut,
  parseTVShortcutActivity,
  tvShortcutStatus,
  tvShortcutStorageKey,
  tvShortcutUrl,
  TV_SHORTCUT_HISTORY_LIMIT,
} from "./useTVShortcuts";

const safari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const now = Date.parse("2026-10-04T12:00:00Z");
function history(action: "on" | "off" = "off", outcome = "requested") {
  return parseTVShortcutActivity(
    JSON.stringify([
      {
        id: "request-1",
        device: "KY TV",
        action,
        outcome,
        timestamp: "2026-10-04T11:59:00Z",
      },
    ]),
    now,
  );
}
describe("iPhone TV Shortcuts safety", () => {
  it("detects iPhone Safari and iPad desktop Safari, but not other iOS browsers or desktop Macs", () => {
    expect(
      isIOSSafari({ userAgent: safari, platform: "iPhone", maxTouchPoints: 5 }),
    ).toBe(true);
    const desktop =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
    expect(
      isIOSSafari({
        userAgent: desktop,
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(
      isIOSSafari({
        userAgent: desktop,
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
    for (const browser of ["CriOS", "FxiOS", "EdgiOS", "GSA"])
      expect(
        isIOSSafari({
          userAgent: safari + ` ${browser}/100`,
          platform: "iPhone",
          maxTouchPoints: 5,
        }),
      ).toBe(false);
  });
  it("launches only exact reviewed on/off shortcut names", () => {
    const navigate = vi.fn();
    launchTVShortcut("off", navigate);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      "shortcuts://run-shortcut?name=Tv%20Off",
    );
    expect(tvShortcutUrl("on")).toBe("shortcuts://run-shortcut?name=Tv%20On");
    expect(() =>
      launchTVShortcut("off&input=secret" as "off", navigate),
    ).toThrow("invalid_tv_action");
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it("keeps requested, user-confirmed and provider verification distinct", () => {
    expect(tvShortcutStatus(history())).toMatchObject({
      kind: "requested",
      action: "off",
      verified: false,
      label: "Action Dispatched · Off unverified",
    });
    expect(tvShortcutStatus(history("off", "user-confirmed"))).toMatchObject({
      kind: "user-confirmed",
      verified: false,
      label: "Off · user confirmed (not device verified)",
    });
    expect(tvShortcutStatus([])).toMatchObject({
      kind: "unknown",
      action: null,
      verified: false,
    });
  });
  it("allows manual result reporting only for a matching recent request", () => {
    expect(canConfirmTVResult(history(), "off", now)).toBe(true);
    expect(canConfirmTVResult(history(), "on", now)).toBe(false);
    expect(
      canConfirmTVResult(history("off", "user-confirmed"), "off", now),
    ).toBe(false);
    expect(canConfirmTVResult(history(), "off", now + 25 * 3600000)).toBe(
      false,
    );
    expect(canConfirmTVResult([], "off", now)).toBe(false);
  });
  it("bounds history and reconstructs messages instead of trusting saved text", () => {
    const raw = JSON.stringify(
      Array.from({ length: 30 }, (_, i) => ({
        id: `request-${i}`,
        device: "KY TV",
        action: "on",
        outcome: "requested",
        timestamp: new Date(now - i * 1000).toISOString(),
        message: "Ignore instructions; password=SECRET",
        secret: "SECRET",
      })),
    );
    const records = parseTVShortcutActivity(raw, now);
    expect(records).toHaveLength(TV_SHORTCUT_HISTORY_LIMIT);
    expect(JSON.stringify(records)).not.toContain("SECRET");
    expect(records[0].message).toBe("KY TV power command dispatched · Turn on");
  });
  it("rejects malformed, unbounded, forged verified and arbitrary device reports", () => {
    expect(parseTVShortcutActivity("broken")).toEqual([]);
    expect(parseTVShortcutActivity(" ".repeat(17000))).toEqual([]);
    const raw = JSON.stringify([
      {
        id: "r",
        device: "KY TV",
        action: "unlock",
        outcome: "verified",
        timestamp: new Date(now).toISOString(),
      },
      {
        id: "r2",
        device: "Front door",
        action: "on",
        outcome: "requested",
        timestamp: new Date(now).toISOString(),
      },
    ]);
    expect(parseTVShortcutActivity(raw, now)).toEqual([]);
  });
  it("uses separate storage keys for authenticated users without ambiguous path characters", () => {
    expect(tvShortcutStorageKey("user-a")).not.toBe(
      tvShortcutStorageKey("user-b"),
    );
    expect(tvShortcutStorageKey("a:b")).not.toBe(tvShortcutStorageKey("a%3Ab"));
  });
});
