import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthProfileReady } from "deepspace";
import { isIOSSafari } from "./useTVShortcuts";

export const VAMP_SHORTCUT_URL = "shortcuts://run-shortcut?name=Play%20Vamp";
export const VAMP_SHORTCUT_LAUNCH_EVENT = "jarvis-music-shortcut-launch";
export const VAMP_REQUEST_STATUS =
  "Requested — awaiting device playback confirmation.";
export const VAMP_ACTIVITY_MESSAGE = "Music request dispatched: Play Vamp";
const UPDATED_EVENT = "jarvis-vamp-shortcut-updated";
export type VampShortcutActivity = {
  id: string;
  message: string;
  timestamp: string;
};
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
          value.message === VAMP_ACTIVITY_MESSAGE &&
          typeof value.timestamp === "string" &&
          value.timestamp.length <= 40 &&
          Number.isFinite(Date.parse(value.timestamp)) &&
          Date.parse(value.timestamp) <= now + 60000,
      )
      .map(
        (value): VampShortcutActivity => ({
          id: value.id as string,
          message: VAMP_ACTIVITY_MESSAGE,
          timestamp: new Date(value.timestamp as string).toISOString(),
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
    if (identityRef.current !== identity) return false;
    const previous =
      activityRef.current.owner === identity
        ? activityRef.current.activity
        : [];
    const entry = {
      id: crypto.randomUUID(),
      message: VAMP_ACTIVITY_MESSAGE,
      timestamp: new Date().toISOString(),
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
      /* Keep the unverified request report in memory; never retry the shortcut. */
    }
    return true;
  }, [identity, supported]);
  const activity = identity && stored.owner === identity ? stored.activity : [];
  return {
    supported,
    pending: !!identity && pendingOwner === identity,
    status: activity.length ? VAMP_REQUEST_STATUS : null,
    activity,
    request,
    cancel,
    launch,
  };
}
export type VampShortcutController = ReturnType<typeof useVampShortcut>;
