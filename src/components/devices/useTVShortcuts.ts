import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthProfileReady } from "deepspace";

export type TVShortcutAction = "on" | "off";
export type TVShortcutOutcome = "requested" | "user-confirmed";
export type TVShortcutActivity = {
  id: string;
  device: "KY TV";
  action: TVShortcutAction;
  outcome: TVShortcutOutcome;
  timestamp: string;
  message: string;
};
export type TVShortcutStatus = {
  kind: "unknown" | TVShortcutOutcome;
  action: TVShortcutAction | null;
  timestamp: string | null;
  /** Shortcuts provides no authenticated device readback. */
  verified: false;
  label: string;
};
export const TV_SHORTCUT_NAME = "KY TV";
export const TV_SHORTCUT_HISTORY_LIMIT = 20;
export const TV_SHORTCUT_LAUNCH_EVENT = "jarvis-tv-shortcut-launch";
const UPDATED_EVENT = "jarvis-tv-shortcuts-updated";
const isAction = (action: unknown): action is TVShortcutAction =>
  action === "on" || action === "off";
function activityMessage(
  action: TVShortcutAction,
  outcome: TVShortcutOutcome,
): string {
  return outcome === "requested"
    ? `KY TV power command dispatched · Turn ${action}`
    : `KY TV · Power ${action} · User confirmed, not device verified`;
}
export function tvShortcutUrl(action: TVShortcutAction): string {
  if (!isAction(action)) throw new Error("invalid_tv_action");
  return `shortcuts://run-shortcut?name=${encodeURIComponent(action === "on" ? "Tv On" : "Tv Off")}`;
}
export function tvShortcutStorageKey(userId: string): string {
  return `jarvis-tv-shortcuts:${encodeURIComponent(userId)}`;
}
export function isIOSSafari(browser: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone?: boolean;
}): boolean {
  const ios =
    /iPhone|iPad|iPod/.test(browser.userAgent) ||
    (browser.platform === "MacIntel" && browser.maxTouchPoints > 1);
  return (
    ios &&
    /AppleWebKit/.test(browser.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA|FBAN|FBAV|Instagram/.test(
      browser.userAgent,
    ) &&
    (browser.standalone === true ||
      (/Safari/.test(browser.userAgent) && /Version\//.test(browser.userAgent)))
  );
}
export function parseTVShortcutActivity(
  raw: string | null,
  now = Date.now(),
): TVShortcutActivity[] {
  if (!raw || raw.length > 16000) return [];
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
          value.device === TV_SHORTCUT_NAME &&
          isAction(value.action) &&
          (value.outcome === "requested" ||
            value.outcome === "user-confirmed") &&
          typeof value.timestamp === "string" &&
          value.timestamp.length <= 40 &&
          Number.isFinite(Date.parse(value.timestamp)) &&
          Date.parse(value.timestamp) <= now + 60000,
      )
      .map(
        (value): TVShortcutActivity => ({
          id: value.id as string,
          device: TV_SHORTCUT_NAME,
          action: value.action as TVShortcutAction,
          outcome: value.outcome as TVShortcutOutcome,
          timestamp: new Date(value.timestamp as string).toISOString(),
          message: activityMessage(
            value.action as TVShortcutAction,
            value.outcome as TVShortcutOutcome,
          ),
        }),
      )
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, TV_SHORTCUT_HISTORY_LIMIT);
  } catch {
    return [];
  }
}
export function tvShortcutStatus(
  activity: TVShortcutActivity[],
): TVShortcutStatus {
  const latest = activity[0];
  if (!latest)
    return {
      kind: "unknown",
      action: null,
      timestamp: null,
      verified: false,
      label: "State unknown · iPhone Shortcut",
    };
  const action = latest.action === "on" ? "On" : "Off";
  return {
    kind: latest.outcome,
    action: latest.action,
    timestamp: latest.timestamp,
    verified: false,
    label:
      latest.outcome === "requested"
        ? `Action Dispatched · ${action} unverified`
        : `${action} · user confirmed (not device verified)`,
  };
}
/** Browser-local report only: confirmation cannot authorize any server/provider action. */
export function canConfirmTVResult(
  activity: TVShortcutActivity[],
  action: unknown,
  now = Date.now(),
): boolean {
  const latest = activity[0];
  return (
    isAction(action) &&
    latest?.outcome === "requested" &&
    latest.action === action &&
    now - Date.parse(latest.timestamp) >= 0 &&
    now - Date.parse(latest.timestamp) < 24 * 60 * 60 * 1000
  );
}
export function launchTVShortcut(
  action: TVShortcutAction,
  navigate: (url: string) => void,
): void {
  navigate(tvShortcutUrl(action));
}

export function useTVShortcuts() {
  const { userId, isSignedIn, isReady } = useAuthProfileReady({
    requireUser: true,
  });
  const identity = isReady && isSignedIn ? userId : null;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [stored, setStored] = useState<{
    owner: string | null;
    activity: TVShortcutActivity[];
  }>({ owner: null, activity: [] });
  const [pending, setPending] = useState<{
    owner: string;
    action: TVShortcutAction;
  } | null>(null);
  const pendingRef = useRef(pending);
  const activityRef = useRef(stored);
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
      let activity: TVShortcutActivity[] = [];
      if (identity) {
        try {
          activity = parseTVShortcutActivity(
            localStorage.getItem(tvShortcutStorageKey(identity)),
          );
        } catch {
          /* Storage can be unavailable; status stays in memory. */
        }
      }
      const next = { owner: identity, activity };
      activityRef.current = next;
      setStored(next);
    }
    pendingRef.current = null;
    setPending(null);
    load();
    const onStorage = (event: StorageEvent) => {
      if (
        identity &&
        (event.key === tvShortcutStorageKey(identity) || event.key === null)
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
  const addActivity = useCallback(
    (action: TVShortcutAction, outcome: TVShortcutOutcome) => {
      if (!identity || currentIdentity.current !== identity) return;
      const previous =
        activityRef.current.owner === identity
          ? activityRef.current.activity
          : [];
      const entry: TVShortcutActivity = {
        id: crypto.randomUUID(),
        device: TV_SHORTCUT_NAME,
        action,
        outcome,
        timestamp: new Date().toISOString(),
        message: activityMessage(action, outcome),
      };
      const next = {
        owner: identity,
        activity: [entry, ...previous].slice(0, TV_SHORTCUT_HISTORY_LIMIT),
      };
      activityRef.current = next;
      setStored(next);
      try {
        localStorage.setItem(
          tvShortcutStorageKey(identity),
          JSON.stringify(next.activity),
        );
        window.dispatchEvent(new Event(UPDATED_EVENT));
      } catch {
        /* The report remains usable without persistent storage. */
      }
    },
    [identity],
  );
  const requestAction = useCallback(
    (action: TVShortcutAction) => {
      if (
        !supported ||
        !identity ||
        currentIdentity.current !== identity ||
        !isAction(action)
      )
        return false;
      const next = { owner: identity, action };
      pendingRef.current = next;
      setPending(next);
      return true;
    },
    [identity, supported],
  );
  const cancel = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);
  const launch = useCallback(() => {
    const next = pendingRef.current;
    if (
      !supported ||
      !identity ||
      currentIdentity.current !== identity ||
      next?.owner !== identity
    )
      return false;
    if (navigator.userActivation && !navigator.userActivation.isActive)
      return false;
    // Claim this exact pending action before handing off; a repeated callback cannot launch it twice.
    pendingRef.current = null;
    setPending(null);
    const url = tvShortcutUrl(next.action);
    // Allows an embedding native shell (or browser test) to handle the same reviewed handoff.
    const event = new CustomEvent(TV_SHORTCUT_LAUNCH_EVENT, {
      cancelable: true,
      detail: { action: next.action, url },
    });
    try {
      if (window.dispatchEvent(event))
        launchTVShortcut(next.action, (target) =>
          window.location.assign(target),
        );
      addActivity(next.action, "requested");
      return true;
    } catch {
      return false;
    }
  }, [addActivity, identity, supported]);
  const confirmResult = useCallback(
    (action: TVShortcutAction) => {
      if (
        !identity ||
        currentIdentity.current !== identity ||
        pendingRef.current ||
        activityRef.current.owner !== identity ||
        !canConfirmTVResult(activityRef.current.activity, action)
      )
        return false;
      if (navigator.userActivation && !navigator.userActivation.isActive)
        return false;
      addActivity(action, "user-confirmed");
      return true;
    },
    [identity, addActivity],
  );
  const activity = stored.owner === identity && identity ? stored.activity : [];
  return {
    supported,
    pendingAction: pending?.owner === identity ? pending.action : null,
    status: tvShortcutStatus(activity),
    activity,
    requestAction,
    cancel,
    launch,
    confirmResult,
  };
}
export type TVShortcutController = ReturnType<typeof useTVShortcuts>;
