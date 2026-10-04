import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthProfileReady } from "deepspace";
import { isIOSSafari } from "./useTVShortcuts";

export const VAMP_SHORTCUT_URL = "shortcuts://run-shortcut?name=Play%20Vamp";
export const VAMP_SHORTCUT_LAUNCH_EVENT = "jarvis-music-shortcut-launch";
export const VAMP_REQUEST_STATUS = "Playback requested — awaiting confirmation";
export const VAMP_ACTIVITY_MESSAGE =
  "Apple Music request dispatched: Play Vamp";
export type VampShortcutOutcome =
  | "requested"
  | "user-confirmed-playing"
  | "user-reported-not-playing";
const messages: Record<VampShortcutOutcome, string> = {
  requested: VAMP_ACTIVITY_MESSAGE,
  "user-confirmed-playing": "Playback manually confirmed: Vamp",
  "user-reported-not-playing": "Playback not confirmed for Vamp",
};
const UPDATED_EVENT = "jarvis-vamp-shortcut-updated";
export type VampShortcutActivity = {
  id: string;
  message: string;
  timestamp: string;
  outcome: VampShortcutOutcome;
  source: "shortcut-request" | "user-report";
  verified: false;
};
function readOutcome(
  value: Record<string, unknown>,
): VampShortcutOutcome | null {
  const outcome = value.outcome;
  if (
    outcome === undefined &&
    (value.message === "Music request dispatched: Play Vamp" ||
      value.message === VAMP_ACTIVITY_MESSAGE)
  )
    return "requested";
  if (
    outcome !== "requested" &&
    outcome !== "user-confirmed-playing" &&
    outcome !== "user-reported-not-playing"
  )
    return null;
  return value.message === messages[outcome] ||
    (outcome === "requested" &&
      value.message === "Music request dispatched: Play Vamp")
    ? outcome
    : null;
}
export function vampShortcutStatus(
  activity: VampShortcutActivity[],
): string | null {
  switch (activity[0]?.outcome) {
    case "requested":
      return VAMP_REQUEST_STATUS;
    case "user-confirmed-playing":
      return "Playing: Vamp";
    case "user-reported-not-playing":
      return "Playback not confirmed";
    default:
      return null;
  }
}
export function canReportVampPlayback(
  activity: VampShortcutActivity[],
  now = Date.now(),
): boolean {
  const latest = activity[0];
  if (!latest || latest.outcome !== "requested") return false;
  const age = now - Date.parse(latest.timestamp);
  return age >= 0 && age < 24 * 60 * 60 * 1000;
}
export function vampShortcutStorageKey(userId: string): string {
  return `jarvis-vamp-shortcut:${encodeURIComponent(userId)}`;
}
export function parseVampActivity(
  raw: string | null,
  now = Date.now(),
): VampShortcutActivity[] {
  if (!raw || raw.length > 12000) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values
      .filter(
        (value): value is Record<string, unknown> =>
          !!value && typeof value === "object",
      )
      .filter(
        (value) =>
          typeof value.id === "string" &&
          /^[a-zA-Z0-9-]{1,100}$/.test(value.id) &&
          readOutcome(value) !== null &&
          typeof value.timestamp === "string" &&
          value.timestamp.length <= 40 &&
          Number.isFinite(Date.parse(value.timestamp)) &&
          Date.parse(value.timestamp) <= now + 60000,
      )
      .map(
        (value): VampShortcutActivity => ({
          id: value.id as string,
          message: messages[readOutcome(value)!],
          timestamp: new Date(value.timestamp as string).toISOString(),
          outcome: readOutcome(value)!,
          source:
            readOutcome(value) === "requested"
              ? "shortcut-request"
              : "user-report",
          verified: false,
        }),
      )
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, 20);
  } catch {
    return [];
  }
}
/** Fixed handoff only. Completion of this call does not establish music playback. */
export function launchVampShortcut(navigate: (url: string) => void): void {
  navigate(VAMP_SHORTCUT_URL);
}
export function useVampShortcut() {
  const { userId, isSignedIn, isReady } = useAuthProfileReady({
    requireUser: true,
  });
  const identity = isReady && isSignedIn ? userId : null;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [stored, setStored] = useState<{
    owner: string | null;
    activity: VampShortcutActivity[];
  }>({ owner: null, activity: [] });
  const activityRef = useRef(stored);
  const [pendingOwner, setPendingOwner] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const supported =
    typeof navigator !== "undefined" &&
    isIOSSafari({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      standalone: (navigator as Navigator & { standalone?: boolean })
        .standalone,
    });
  useEffect(() => {
    function load() {
      let activity: VampShortcutActivity[] = [];
      if (identity) {
        try {
          activity = parseVampActivity(
            localStorage.getItem(vampShortcutStorageKey(identity)),
          );
        } catch {
          /* Requests can still be reported in memory if storage is blocked. */
        }
      }
      const next = { owner: identity, activity };
      activityRef.current = next;
      setStored(next);
    }
    pendingRef.current = null;
    setPendingOwner(null);
    load();
    const onStorage = (event: StorageEvent) => {
      if (
        identity &&
        (event.key === vampShortcutStorageKey(identity) || event.key === null)
      )
        load();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(UPDATED_EVENT, load);
    return () => {
      pendingRef.current = null;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(UPDATED_EVENT, load);
    };
  }, [identity]);
  const request = useCallback(() => {
    if (!supported || !identity || identityRef.current !== identity)
      return false;
    pendingRef.current = identity;
    setPendingOwner(identity);
    return true;
  }, [identity, supported]);
  const cancel = useCallback(() => {
    pendingRef.current = null;
    setPendingOwner(null);
  }, []);
  const addActivity = useCallback(
    (outcome: VampShortcutOutcome) => {
      if (!identity || identityRef.current !== identity) return false;
      const previous =
        activityRef.current.owner === identity
          ? activityRef.current.activity
          : [];
      const entry: VampShortcutActivity = {
        id: crypto.randomUUID(),
        message: messages[outcome],
        timestamp: new Date().toISOString(),
        outcome,
        source: outcome === "requested" ? "shortcut-request" : "user-report",
        verified: false,
      };
      const next = {
        owner: identity,
        activity: [entry, ...previous].slice(0, 20),
      };
      activityRef.current = next;
      setStored(next);
      try {
        localStorage.setItem(
          vampShortcutStorageKey(identity),
          JSON.stringify(next.activity),
        );
        window.dispatchEvent(new Event(UPDATED_EVENT));
      } catch {
        /* Keep this user-scoped report in memory; never retry the shortcut. */
      }
      return true;
    },
    [identity],
  );
  const launch = useCallback(() => {
    if (
      !supported ||
      !identity ||
      identityRef.current !== identity ||
      pendingRef.current !== identity
    )
      return false;
    if (navigator.userActivation && !navigator.userActivation.isActive)
      return false;
    pendingRef.current = null;
    setPendingOwner(null);
    try {
      const event = new CustomEvent(VAMP_SHORTCUT_LAUNCH_EVENT, {
        cancelable: true,
        detail: { name: "Play Vamp", url: VAMP_SHORTCUT_URL },
      });
      if (window.dispatchEvent(event))
        launchVampShortcut((url) => window.location.assign(url));
    } catch {
      return false;
    }
    return addActivity("requested");
  }, [identity, supported, addActivity]);
  const reportPlayback = useCallback(
    (outcome: "user-confirmed-playing" | "user-reported-not-playing") => {
      if (
        !identity ||
        identityRef.current !== identity ||
        pendingRef.current ||
        activityRef.current.owner !== identity ||
        !canReportVampPlayback(activityRef.current.activity)
      )
        return false;
      if (navigator.userActivation && !navigator.userActivation.isActive)
        return false;
      return addActivity(outcome);
    },
    [identity, addActivity],
  );
  const confirmPlaying = useCallback(
    () => reportPlayback("user-confirmed-playing"),
    [reportPlayback],
  );
  const notPlaying = useCallback(
    () => reportPlayback("user-reported-not-playing"),
    [reportPlayback],
  );
  const activity = identity && stored.owner === identity ? stored.activity : [];
  return {
    supported,
    pending: !!identity && pendingOwner === identity,
    canReport: pendingOwner !== identity && canReportVampPlayback(activity),
    status: vampShortcutStatus(activity),
    userReported: activity[0]?.source === "user-report",
    verified: false as const,
    activity,
    request,
    cancel,
    launch,
    confirmPlaying,
    notPlaying,
  };
}
export type VampShortcutController = ReturnType<typeof useVampShortcut>;
