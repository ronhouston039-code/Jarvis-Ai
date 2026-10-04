import { describe, expect, it, vi } from "vitest";
vi.mock("deepspace", () => ({ useAuthProfileReady: vi.fn() }));
import {
  launchVampShortcut,
  parseVampActivity,
  vampShortcutStorageKey,
  VAMP_ACTIVITY_MESSAGE,
  VAMP_REQUEST_STATUS,
  VAMP_SHORTCUT_URL,
} from "./useVampShortcut";
const now = Date.parse("2026-10-04T15:00:00Z");
describe("reviewed Play Vamp shortcut", () => {
  it("hands off only the fixed encoded shortcut URL", () => {
    const navigate = vi.fn();
    launchVampShortcut(navigate);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      "shortcuts://run-shortcut?name=Play%20Vamp",
    );
    expect(VAMP_SHORTCUT_URL).not.toContain("input=");
  });
  it("reports an unverified request rather than successful playback", () => {
    expect(VAMP_REQUEST_STATUS).toBe(
      "Requested — awaiting device playback confirmation.",
    );
    expect(VAMP_ACTIVITY_MESSAGE).toBe("Music request dispatched: Play Vamp");
  });
  it("does not retry a failed handoff", () => {
    const navigate = vi.fn(() => {
      throw new Error("native_handoff_failed");
    });
    expect(() => launchVampShortcut(navigate)).toThrow("native_handoff_failed");
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it("bounds stored activity and strips extra private fields", () => {
    const raw = JSON.stringify(
      Array.from({ length: 30 }, (_, i) => ({
        id: `request-${i}`,
        message: VAMP_ACTIVITY_MESSAGE,
        timestamp: new Date(now - i * 1000).toISOString(),
        token: "SECRET",
      })),
    );
    const result = parseVampActivity(raw, now);
    expect(result).toHaveLength(20);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(result[0].id).toBe("request-0");
  });
  it("rejects malformed, oversized and forged playback-completion activity", () => {
    expect(parseVampActivity("broken")).toEqual([]);
    expect(parseVampActivity(" ".repeat(13000))).toEqual([]);
    expect(
      parseVampActivity(
        JSON.stringify([
          {
            id: "request-1",
            message: "Playback confirmed",
            timestamp: new Date(now).toISOString(),
          },
        ]),
        now,
      ),
    ).toEqual([]);
  });
  it("keeps histories separate for distinct authenticated users", () => {
    expect(vampShortcutStorageKey("user-a")).not.toBe(
      vampShortcutStorageKey("user-b"),
    );
    expect(vampShortcutStorageKey("a:b")).not.toBe(
      vampShortcutStorageKey("a%3Ab"),
    );
  });
});
