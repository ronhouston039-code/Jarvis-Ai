import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthProfileReady } from "deepspace";
import { isIOSSafari } from "./useTVShortcuts";
import {
  isVerifiedVampPlayback,
  type VampPlaybackObservation,
} from "../apple-music";

export const VAMP_SHORTCUT_URL = "shortcuts://run-shortcut?name=Play%20Vamp";
export const VAMP_SHORTCUT_LAUNCH_EVENT = "jarvis-music-shortcut-launch";
export const VAMP_REQUEST_STATUS = "Playback requested — awaiting confirmation";
export const VAMP_ACTIVITY_MESSAGE =
  "Apple Music request dispatched: Play Vamp";
export type VampShortcutOutcome =
  | "requested"
  | "user-confirmed-playing"
  | "user-reported-not-playing"
  | "musickit-verified";
const messages: Record<VampShortcutOutcome, string> = {
  requested: VAMP_ACTIVITY_MESSAGE,
  "user-confirmed-playing": "User reported playback started: Vamp",
  "user-reported-not-playing": "User reported playback did not start: Vamp",
  "musickit-verified": "MusicKit verified playback: Vamp",
};
const UPDATED_EVENT = "jarvis-vamp-shortcut-updated";
const RECENT_REQUEST_MS = 24 * 60 * 60 * 1000;
const OBSERVATION_MAX_AGE_MS = 30 * 1000;
const isActivityId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(value);
export type VampShortcutActivity = {
  id: string;
  message: string;
  timestamp: string;
  outcome: VampShortcutOutcome;
  source: "shortcut-request" | "user-report" | "musickit";
  verified: false;
  requestId?: string;
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
    outcome !== "user-reported-not-playing" &&
    outcome !== "musickit-verified"
  )
    return null;
  return value.message === messages[outcome] ||
    (outcome === "requested" &&
      value.message === "Music request dispatched: Play Vamp") ||
    (outcome === "user-confirmed-playing" &&
      value.message === "Playback manually confirmed: Vamp") ||
    (outcome === "user-reported-not-playing" &&
      value.message === "Playback not confirmed for Vamp")
    ? outcome
    : null;
}
export function vampShortcutStatus(
  activity: VampShortcutActivity[],
): string | null {
  // Historical SDK events are audit data, never proof of current playback.
  switch (activity.find((item) => item.source !== "musickit")?.outcome) {
    case "requested":
      return VAMP_REQUEST_STATUS;
    case "user-confirmed-playing":
      return "Reported playing: Vamp";
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
  const latest = activity.find((item) => item.source !== "musickit");
  if (!latest || latest.outcome !== "requested") return false;
  const age = now - Date.parse(latest.timestamp);
  return age >= 0 && age < RECENT_REQUEST_MS;
}
export function vampShortcutStorageKey(userId: string): string {
  return `jarvis-vamp-shortcut:${encodeURIComponent(userId)}`;
}
export function latestVampDispatch(
  activity: VampShortcutActivity[],
  now = Date.now(),
): VampShortcutActivity | null {
  const latest = activity.find((item) => item.outcome === "requested");
  if (!latest) return null;
  const age = now - Date.parse(latest.timestamp);
  return age >= 0 && age < RECENT_REQUEST_MS ? latest : null;
}
/** A stored result cannot establish playback; only a fresh scoped SDK read can. */
export function verifiedVampDispatch(
  activity: VampShortcutActivity[],
  userId: string | null,
  observation: VampPlaybackObservation | null,
  now = Date.now(),
): VampShortcutActivity | null {
  if (
    !userId ||
    !observation ||
    observation.userId !== userId ||
    !Number.isFinite(observation.observedAt) ||
    !isVerifiedVampPlayback(observation)
  )
    return null;
  const dispatch = latestVampDispatch(activity, now);
  const age = now - observation.observedAt;
  return dispatch &&
    observation.observedAt > Date.parse(dispatch.timestamp) &&
    age >= 0 &&
    age <= OBSERVATION_MAX_AGE_MS
    ? dispatch
    : null;
}
export function vampPlaybackState(
  activity: VampShortcutActivity[],
  userId: string | null,
  observation: VampPlaybackObservation | null,
  now = Date.now(),
) {
  const verified = !!verifiedVampDispatch(activity, userId, observation, now);
  const userReported =
    !verified &&
    activity.find((item) => item.source !== "musickit")?.source ===
      "user-report";
  return {
    verified,
    userReported,
    status: verified ? "Playing: Vamp" : vampShortcutStatus(activity),
    verificationSource: verified
      ? "MusicKit verified"
      : userReported
        ? "User-reported — not provider verified"
        : null,
    canReport: !verified && canReportVampPlayback(activity, now),
  };
}
/** Keeps provider audit history idempotent without treating it as live state. */
export function appendVampActivity(
  activity: VampShortcutActivity[],
  outcome: VampShortcutOutcome,
  id: string,
  requestId?: string,
  now = Date.now(),
): VampShortcutActivity[] | null {
  if (!isActivityId(id) || !Number.isFinite(now)) return null;
  const dispatch = latestVampDispatch(activity, now);
  if (outcome === "musickit-verified") {
    if (!isActivityId(requestId) || dispatch?.id !== requestId) return null;
    if (
      activity.some(
        (item) =>
          item.outcome === "musickit-verified" && item.requestId === requestId,
      )
    )
      return activity;
  } else if (outcome !== "requested" && !canReportVampPlayback(activity, now))
    return null;
  const entry: VampShortcutActivity = {
    id,
    message: messages[outcome],
    timestamp: new Date(now).toISOString(),
    outcome,
    source:
      outcome === "requested"
        ? "shortcut-request"
        : outcome === "musickit-verified"
          ? "musickit"
          : "user-report",
    verified: false,
    ...(outcome === "requested"
      ? { requestId: id }
      : outcome === "musickit-verified"
        ? { requestId }
        : dispatch
          ? { requestId: dispatch.id }
          : {}),
  };
  return [entry, ...activity].slice(0, 20);
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
          isActivityId(value.id) &&
          readOutcome(value) !== null &&
          (readOutcome(value) !== "musickit-verified" ||
            isActivityId(value.requestId)) &&
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
              : readOutcome(value) === "musickit-verified"
                ? "musickit"
                : "user-report",
          verified: false,
          ...(readOutcome(value) === "requested"
            ? { requestId: value.id as string }
            : isActivityId(value.requestId)
              ? { requestId: value.requestId }
              : {}),
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
  const sessionRef = useRef({ identity, epoch: 0 });
  if (sessionRef.current.identity !== identity)
    sessionRef.current = {
      identity,
      epoch: sessionRef.current.epoch + 1,
    };
  const identityEpoch = sessionRef.current.epoch;
  const [stored, setStored] = useState<{
    owner: string | null;
    activity: VampShortcutActivity[];
  }>({ owner: null, activity: [] });
  const activityRef = useRef(stored);
  const [live, setLive] = useState<{
    owner: string;
    epoch: number;
    observation: VampPlaybackObservation;
  } | null>(null);
  const liveRef = useRef(live);
  const clearLive = useCallback(() => {
    liveRef.current = null;
    setLive(null);
  }, []);
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
      if (
        liveRef.current &&
        (liveRef.current.owner !== identity ||
          liveRef.current.epoch !== identityEpoch ||
          !verifiedVampDispatch(
            activity,
            identity,
            liveRef.current.observation,
          ))
      )
        clearLive();
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
  }, [identity, identityEpoch, clearLive]);
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
    (outcome: VampShortcutOutcome, requestId?: string) => {
      if (!identity || identityRef.current !== identity) return false;
      const previous =
        activityRef.current.owner === identity
          ? activityRef.current.activity
          : [];
      const activity = appendVampActivity(
        previous,
        outcome,
        crypto.randomUUID(),
        requestId,
      );
      if (!activity) return false;
      if (activity === previous) return true;
      if (outcome === "requested") clearLive();
      const next = { owner: identity, activity };
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
    [identity, clearLive],
  );
  const observeMusicKitPlayback = useCallback(
    (observation: VampPlaybackObservation | null): void => {
      if (
        !identity ||
        identityRef.current !== identity ||
        sessionRef.current.epoch !== identityEpoch
      )
        return;
      const dispatch =
        activityRef.current.owner === identity
          ? verifiedVampDispatch(
              activityRef.current.activity,
              identity,
              observation,
            )
          : null;
      if (!dispatch || !observation) {
        clearLive();
        return;
      }
      const next = { owner: identity, epoch: identityEpoch, observation };
      liveRef.current = next;
      setLive(next);
      addActivity("musickit-verified", dispatch.id);
    },
    [identity, identityEpoch, clearLive, addActivity],
  );
  useEffect(() => {
    if (!live) return;
    const dispatch = verifiedVampDispatch(
      stored.owner === identity ? stored.activity : [],
      identity,
      live.owner === identity && live.epoch === identityEpoch
        ? live.observation
        : null,
    );
    if (!dispatch) {
      clearLive();
      return;
    }
    const expiresAt = Math.min(
      live.observation.observedAt + OBSERVATION_MAX_AGE_MS + 1,
      Date.parse(dispatch.timestamp) + RECENT_REQUEST_MS,
    );
    const timer = window.setTimeout(
      () => {
        if (liveRef.current === live) clearLive();
      },
      Math.max(0, expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [live, identity, identityEpoch, stored, clearLive]);
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
        !vampPlaybackState(
          activityRef.current.activity,
          identity,
          liveRef.current?.owner === identity &&
            liveRef.current.epoch === sessionRef.current.epoch
            ? liveRef.current.observation
            : null,
        ).canReport
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
  const playback = vampPlaybackState(
    activity,
    identity,
    live?.owner === identity && live.epoch === identityEpoch
      ? live.observation
      : null,
  );
  return {
    supported,
    pending: !!identity && pendingOwner === identity,
    ...playback,
    canReport: pendingOwner !== identity && playback.canReport,
    activity,
    request,
    cancel,
    launch,
    confirmPlaying,
    notPlaying,
    observeMusicKitPlayback,
  };
}
export type VampShortcutController = ReturnType<typeof useVampShortcut>;
