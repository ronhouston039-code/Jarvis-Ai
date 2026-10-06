import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthProfileReady } from "deepspace";
import { authenticatedFetch } from "../../jarvis/client";
import {
  emptyHomeDashboard,
  readHomeDashboard,
  type HomeDashboardSnapshot,
} from "./home-dashboard";

export type {
  HomeDashboardPhase,
  HomeDashboardSnapshot,
} from "./home-dashboard";

export function useHomeDashboard() {
  const { userId, isSignedIn, isReady } = useAuthProfileReady({
    requireUser: true,
  });
  const [stored, setStored] = useState<{
    userId: string | null;
    snapshot: HomeDashboardSnapshot;
  }>({
    userId: null,
    snapshot: emptyHomeDashboard("checking"),
  });
  const activeRequest = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    activeRequest.current?.abort("replacement");
    if (!isReady || !isSignedIn || !userId) {
      setStored({
        userId,
        snapshot: emptyHomeDashboard(isReady ? "forbidden" : "checking"),
      });
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    // A failed refresh clears previous device states instead of displaying them as current.
    const snapshot = await readHomeDashboard(
      authenticatedFetch,
      controller.signal,
    );
    if (!controller.signal.aborted) setStored({ userId, snapshot });
  }, [isReady, isSignedIn, userId]);
  useEffect(() => {
    void refresh();
    const visibility = () => {
      if (document.hidden) activeRequest.current?.abort("background");
      else void refresh();
    };
    const pagehide = () => activeRequest.current?.abort("background");
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60000);
    return () => {
      window.clearInterval(timer);
      activeRequest.current?.abort("dispose");
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
    };
  }, [refresh]);
  const snapshot =
    stored.userId === userId && isSignedIn
      ? stored.snapshot
      : emptyHomeDashboard(isReady && !isSignedIn ? "forbidden" : "checking");
  return { ...snapshot, refresh };
}
