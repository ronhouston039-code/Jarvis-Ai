import { describe, expect, it, vi } from "vitest";
vi.mock("deepspace", () => ({ useAuthProfileReady: vi.fn() }));
import { VAMP_PLAYLIST_ID, type VampPlaybackObservation } from "../apple-music";
import {
  appendVampActivity,
  launchVampShortcut,
  parseVampActivity,
  vampShortcutStorageKey,
  VAMP_ACTIVITY_MESSAGE,
  VAMP_REQUEST_STATUS,
  VAMP_SHORTCUT_URL,
  canReportVampPlayback,
  vampShortcutStatus,
  latestVampDispatch,
  verifiedVampDispatch,
  vampPlaybackState,
} from "./useVampShortcut";
const now = Date.parse("2026-10-04T15:00:00Z");
const requestTime = now - 60000;
const observation: VampPlaybackObservation = {
  userId: "user-a",
  observedAt: now,
  authorized: true,
  playing: true,
  itemId: "123456789",
  playlistId: VAMP_PLAYLIST_ID,
};
const requested = () =>
  appendVampActivity([], "requested", "request-1", undefined, requestTime)!;
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
      "Playback requested — awaiting confirmation",
    );
    expect(VAMP_ACTIVITY_MESSAGE).toBe(
      "Apple Music request dispatched: Play Vamp",
    );
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
  it("migrates legacy requests without turning them into verified playback", () => {
    const records = parseVampActivity(
      JSON.stringify([
        {
          id: "legacy-1",
          message: "Music request dispatched: Play Vamp",
          timestamp: new Date(now - 1000).toISOString(),
          verified: true,
        },
      ]),
      now,
    );
    expect(records[0]).toMatchObject({
      message: VAMP_ACTIVITY_MESSAGE,
      outcome: "requested",
      source: "shortcut-request",
      verified: false,
    });
    expect(vampShortcutStatus(records)).toBe(VAMP_REQUEST_STATUS);
  });
  it("marks manual playing and not-playing reports as user reports, never provider verification", () => {
    for (const [outcome, message, status] of [
      [
        "user-confirmed-playing",
        "User reported playback started: Vamp",
        "Reported playing: Vamp",
      ],
      [
        "user-reported-not-playing",
        "User reported playback did not start: Vamp",
        "Playback not confirmed",
      ],
    ]) {
      const records = parseVampActivity(
        JSON.stringify([
          {
            id: "report-1",
            outcome,
            message,
            timestamp: new Date(now - 1000).toISOString(),
            verified: true,
            source: "provider",
          },
        ]),
        now,
      );
      expect(records[0]).toMatchObject({
        outcome,
        source: "user-report",
        verified: false,
      });
      expect(vampShortcutStatus(records)).toBe(status);
      expect(canReportVampPlayback(records, now)).toBe(false);
      expect(vampPlaybackState(records, "user-a", null, now)).toMatchObject({
        status,
        verified: false,
        userReported: true,
        verificationSource: "User-reported — not provider verified",
      });
    }
  });
  it("permits a report only against the latest unreported request for less than 24 hours", () => {
    const records = parseVampActivity(
      JSON.stringify([
        {
          id: "request-1",
          outcome: "requested",
          message: VAMP_ACTIVITY_MESSAGE,
          timestamp: new Date(now - 1000).toISOString(),
        },
      ]),
      now,
    );
    expect(canReportVampPlayback(records, now)).toBe(true);
    expect(canReportVampPlayback(records, now + 24 * 3600000)).toBe(false);
    expect(canReportVampPlayback(records, now - 2000)).toBe(false);
    expect(canReportVampPlayback([], now)).toBe(false);
  });
  it("rejects mismatched outcome/message combinations", () => {
    const records = parseVampActivity(
      JSON.stringify([
        {
          id: "request-1",
          outcome: "user-confirmed-playing",
          message: VAMP_ACTIVITY_MESSAGE,
          timestamp: new Date(now).toISOString(),
        },
      ]),
      now,
    );
    expect(records).toEqual([]);
    expect(vampShortcutStatus(records)).toBeNull();
  });
  it("migrates both legacy manual labels and strips their claimed provider fields", () => {
    for (const [outcome, legacyMessage, message] of [
      [
        "user-confirmed-playing",
        "Playback manually confirmed: Vamp",
        "User reported playback started: Vamp",
      ],
      [
        "user-reported-not-playing",
        "Playback not confirmed for Vamp",
        "User reported playback did not start: Vamp",
      ],
    ]) {
      const records = parseVampActivity(
        JSON.stringify([
          {
            id: "legacy-report",
            outcome,
            message: legacyMessage,
            timestamp: new Date(now - 1000).toISOString(),
            source: "musickit",
            verified: true,
            token: "PRIVATE",
            requestId: "https://private.example/token",
          },
        ]),
        now,
      );
      expect(records[0]).toEqual({
        id: "legacy-report",
        outcome,
        message,
        timestamp: new Date(now - 1000).toISOString(),
        source: "user-report",
        verified: false,
      });
    }
  });
});

describe("fresh Vamp provider observations", () => {
  it("requires an authenticated owner and a recent dispatch before matching SDK playback", () => {
    const history = requested();
    expect(verifiedVampDispatch(history, "user-a", observation, now)).toBe(
      history[0],
    );
    expect(verifiedVampDispatch(history, null, observation, now)).toBeNull();
    expect(
      verifiedVampDispatch(history, "user-b", observation, now),
    ).toBeNull();
    expect(verifiedVampDispatch([], "user-a", observation, now)).toBeNull();
    expect(verifiedVampDispatch(history, "user-a", null, now)).toBeNull();
  });

  it.each([
    { label: "at dispatch", observedAt: requestTime, expected: false },
    { label: "before dispatch", observedAt: requestTime - 1, expected: false },
    { label: "after dispatch", observedAt: requestTime + 1, expected: true },
  ])("accepts observations strictly $label", ({ observedAt, expected }) => {
    expect(
      !!verifiedVampDispatch(
        requested(),
        "user-a",
        { ...observation, observedAt },
        requestTime + 1,
      ),
    ).toBe(expected);
  });

  it.each([
    { label: "30 seconds old", age: 30000, expected: true },
    { label: "over 30 seconds old", age: 30001, expected: false },
    { label: "from the future", age: -1, expected: false },
    { label: "not finite", age: Number.NaN, expected: false },
  ])("checks freshness when $label", ({ age, expected }) => {
    expect(
      !!verifiedVampDispatch(
        requested(),
        "user-a",
        { ...observation, observedAt: now - age },
        now,
      ),
    ).toBe(expected);
  });

  it("expires the dispatch at 24 hours even with a fresh provider read", () => {
    const expiresAt = requestTime + 24 * 3600000;
    expect(
      verifiedVampDispatch(
        requested(),
        "user-a",
        { ...observation, observedAt: expiresAt - 1 },
        expiresAt - 1,
      ),
    ).not.toBeNull();
    expect(
      verifiedVampDispatch(
        requested(),
        "user-a",
        { ...observation, observedAt: expiresAt },
        expiresAt,
      ),
    ).toBeNull();
  });

  it.each([
    { label: "paused", change: { playing: false } },
    { label: "unauthorized", change: { authorized: false } },
    { label: "missing item", change: { itemId: null } },
    { label: "unknown playlist", change: { playlistId: null } },
    { label: "other playlist", change: { playlistId: "pl.other" } },
    {
      label: "playlist substring",
      change: { playlistId: `${VAMP_PLAYLIST_ID}x` },
    },
    { label: "other user", change: { userId: "user-b" } },
  ])("clears verification for $label", ({ change }) => {
    expect(
      vampPlaybackState(
        requested(),
        "user-a",
        { ...observation, ...change },
        now,
      ),
    ).toMatchObject({
      status: VAMP_REQUEST_STATUS,
      verified: false,
      verificationSource: null,
      canReport: true,
    });
  });

  it("shows live provider verification and suppresses manual reporting", () => {
    expect(vampPlaybackState(requested(), "user-a", observation, now)).toEqual({
      status: "Playing: Vamp",
      verified: true,
      userReported: false,
      verificationSource: "MusicKit verified",
      canReport: false,
    });
  });

  it("invalidates an older observation on a new dispatch without deleting history", () => {
    const first = appendVampActivity(
      requested(),
      "musickit-verified",
      "provider-1",
      "request-1",
      now - 1,
    )!;
    const second = appendVampActivity(
      first,
      "requested",
      "request-2",
      undefined,
      now,
    )!;
    expect(vampPlaybackState(second, "user-a", observation, now)).toMatchObject(
      {
        status: VAMP_REQUEST_STATUS,
        verified: false,
        canReport: true,
      },
    );
    expect(second).toHaveLength(3);
    expect(latestVampDispatch(second, now)?.id).toBe("request-2");
    expect(
      verifiedVampDispatch(
        second,
        "user-a",
        { ...observation, observedAt: now + 1 },
        now + 1,
      )?.id,
    ).toBe("request-2");
  });

  it("does not skip a future latest dispatch to verify an earlier request", () => {
    const history = appendVampActivity(
      requested(),
      "requested",
      "future-request",
      undefined,
      now + 1,
    )!;
    expect(latestVampDispatch(history, now)).toBeNull();
    expect(
      verifiedVampDispatch(history, "user-a", observation, now),
    ).toBeNull();
  });
});

describe("Vamp provider audit and manual fallback", () => {
  it("stores one sanitized provider event per dispatch across polling and reload", () => {
    const recorded = appendVampActivity(
      requested(),
      "musickit-verified",
      "provider-1",
      "request-1",
      now,
    )!;
    expect(recorded[0]).toEqual({
      id: "provider-1",
      message: "MusicKit verified playback: Vamp",
      timestamp: new Date(now).toISOString(),
      outcome: "musickit-verified",
      source: "musickit",
      verified: false,
      requestId: "request-1",
    });
    expect(
      appendVampActivity(
        recorded,
        "musickit-verified",
        "provider-2",
        "request-1",
        now + 1,
      ),
    ).toBe(recorded);
    const reloaded = parseVampActivity(JSON.stringify(recorded), now);
    expect(
      appendVampActivity(
        reloaded,
        "musickit-verified",
        "provider-3",
        "request-1",
        now + 2,
      ),
    ).toBe(reloaded);
    expect(vampPlaybackState(reloaded, "user-a", null, now)).toEqual({
      status: VAMP_REQUEST_STATUS,
      verified: false,
      userReported: false,
      verificationSource: null,
      canReport: true,
    });
  });

  it("associates a new provider audit only with the new successful dispatch", () => {
    const first = appendVampActivity(
      requested(),
      "musickit-verified",
      "provider-1",
      "request-1",
      now,
    )!;
    const second = appendVampActivity(
      first,
      "requested",
      "request-2",
      undefined,
      now + 1,
    )!;
    expect(
      appendVampActivity(
        second,
        "musickit-verified",
        "stale-provider",
        "request-1",
        now + 2,
      ),
    ).toBeNull();
    const result = appendVampActivity(
      second,
      "musickit-verified",
      "provider-2",
      "request-2",
      now + 2,
    )!;
    expect(
      result
        .filter((item) => item.source === "musickit")
        .map((item) => item.requestId),
    ).toEqual(["request-2", "request-1"]);
  });

  it.each([
    {
      outcome: "user-confirmed-playing" as const,
      status: "Reported playing: Vamp",
    },
    {
      outcome: "user-reported-not-playing" as const,
      status: "Playback not confirmed",
    },
  ])(
    "restores $status when live verification clears or expires",
    ({ outcome, status }) => {
      const reported = appendVampActivity(
        requested(),
        outcome,
        "report-1",
        undefined,
        now - 1,
      )!;
      const history = appendVampActivity(
        reported,
        "musickit-verified",
        "provider-1",
        "request-1",
        now,
      )!;
      expect(
        vampPlaybackState(history, "user-a", observation, now).verified,
      ).toBe(true);
      for (const [currentObservation, currentTime] of [
        [null, now],
        [{ ...observation, playing: false }, now],
        [observation, now + 30001],
      ] as const) {
        expect(
          vampPlaybackState(history, "user-a", currentObservation, currentTime),
        ).toEqual({
          status,
          verified: false,
          userReported: true,
          verificationSource: "User-reported — not provider verified",
          canReport: false,
        });
        expect(history).toHaveLength(3);
      }
      expect(
        vampPlaybackState(
          parseVampActivity(JSON.stringify(history), now),
          "user-a",
          null,
          now,
        ).status,
      ).toBe(status);
    },
  );

  it("requires a recent unreported request before adding a manual report", () => {
    expect(
      appendVampActivity(
        [],
        "user-confirmed-playing",
        "report-1",
        undefined,
        now,
      ),
    ).toBeNull();
    const reported = appendVampActivity(
      requested(),
      "user-confirmed-playing",
      "report-1",
      undefined,
      now,
    )!;
    expect(reported[0].requestId).toBe("request-1");
    expect(
      appendVampActivity(
        reported,
        "user-reported-not-playing",
        "report-2",
        undefined,
        now + 1,
      ),
    ).toBeNull();
    expect(
      appendVampActivity(
        requested(),
        "user-confirmed-playing",
        "stale-report",
        undefined,
        requestTime + 24 * 3600000,
      ),
    ).toBeNull();
  });

  it("rejects unsafe provider associations and strips audit extras on reload", () => {
    for (const requestId of [
      undefined,
      "wrong-request",
      "private/token",
      "a".repeat(101),
    ]) {
      expect(
        appendVampActivity(
          requested(),
          "musickit-verified",
          "provider-1",
          requestId,
          now,
        ),
      ).toBeNull();
    }
    const audit = {
      id: "provider-1",
      message: "MusicKit verified playback: Vamp",
      outcome: "musickit-verified",
      timestamp: new Date(now).toISOString(),
      requestId: "request-1",
      source: "provider",
      verified: true,
      accessToken: "SECRET",
      playlistId: VAMP_PLAYLIST_ID,
      itemId: "private-item",
      userId: "private-owner",
    };
    const parsed = parseVampActivity(JSON.stringify([audit]), now);
    expect(parsed[0]).toEqual({
      id: audit.id,
      message: audit.message,
      outcome: audit.outcome,
      timestamp: audit.timestamp,
      requestId: audit.requestId,
      source: "musickit",
      verified: false,
    });
    expect(vampPlaybackState(parsed, "user-a", null, now).verified).toBe(false);
    expect(vampShortcutStatus(parsed)).toBeNull();
    for (const requestId of [undefined, "private/token", "a".repeat(101)])
      expect(
        parseVampActivity(JSON.stringify([{ ...audit, requestId }]), now),
      ).toEqual([]);
  });
});
