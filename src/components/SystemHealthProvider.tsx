import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAuthStatus, useQuery } from "deepspace";
import { authenticatedFetch } from "../jarvis/client";
import type { WeatherSnapshot } from "../jarvis/weather";
import { useHomeDashboard } from "./dashboard/useHomeDashboard";
import { SystemHealthController, serviceHealth, type HealthSnapshot } from "./system-health";
import type { VoiceEvidence } from "./jarvis-speech";

type HealthContext = HealthSnapshot & {
  controller: SystemHealthController;
  weather: WeatherSnapshot | null;
  home: ReturnType<typeof useHomeDashboard>;
  setVoiceEnabled: (enabled: boolean) => void;
  voiceEvidence: (evidence: VoiceEvidence) => void;
};
const Context = createContext<HealthContext | null>(null);
export function useSystemHealth() {
  const health = useContext(Context);
  if (!health) throw new Error("SystemHealthProvider is required");
  return health;
}
export function SystemHealthProvider({ children }: { children: ReactNode }) {
  const { userId, isSignedIn } = useAuthStatus();
  // Profile/record reconnects must never remount the existing voice/settings tree.
  return <HealthScope key={isSignedIn ? userId : "signed-out"} userId={isSignedIn ? userId : null}>{children}</HealthScope>;
}
function HealthScope({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [controller] = useState(() => {
    let storage: Storage | undefined;
    let session: Storage | undefined;
    try { if (userId) storage = localStorage; } catch { /* Private browsing. */ }
    try { if (userId) session = sessionStorage; } catch { /* Private browsing. */ }
    return new SystemHealthController(userId ?? "signed-out", storage, session);
  });
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const home = useHomeDashboard();
  const locations = useQuery<{ label: string; latitude: number; longitude: number }>("locations", { where: { enabled: 1 }, limit: 1 });
  const shortcuts = useQuery<{ kind: string }>("device-shortcuts", { where: { enabled: 1 } });
  const musicLinks = useQuery("music-links", { where: { enabled: 1 }, limit: 1 });
  const location = locations.records[0];
  const preferences = useQuery<{ temperatureUnit?: string }>("preferences", { limit: 1 });
  const locationKey = `${userId}:${location?.recordId}:${location?.data.latitude}:${location?.data.longitude}:${location?.data.label}:${preferences.records[0]?.data.temperatureUnit}`;
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  useEffect(() => {
    if (!userId) return;
    let enabled = false;
    try { enabled = sessionStorage.getItem(`jarvis-voice-feedback:${userId}`) === "on"; } catch { /* Default off. */ }
    controller.update(serviceHealth("voice", enabled, enabled ? "unknown" : "disabled", enabled ? "awaiting-playback" : "not-enabled", enabled));
  }, [controller, userId]);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let request: AbortController | undefined;
    const refresh = async () => {
      request?.abort("replacement");
      request = new AbortController();
      const signal = request.signal;
      controller.update(serviceHealth("cloud", true, "checking", "awaiting-check", true));
      try {
        const response = await fetch("/api/health", { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
        const body = await response.json();
        const online = response.ok && !!body && typeof body === "object" && "status" in body && body.status === "ok";
        if (active && !signal.aborted) controller.update(serviceHealth("cloud", true, online ? "online" : "offline", online ? "verified" : "provider-unavailable", true, new Date().toISOString()));
      } catch {
        if (active && !signal.aborted) controller.update(serviceHealth("cloud", true, "offline", "provider-unavailable", true, new Date().toISOString()));
      }
    };
    const visibility = () => { if (document.hidden) request?.abort("background"); else void refresh(); };
    const pagehide = () => request?.abort("background");
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", pagehide);
    return () => { active = false; request?.abort("dispose"); clearInterval(timer); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pagehide); };
  }, [controller, userId]);
  useEffect(() => {
    setWeather(null);
    if (!userId) return;
    if (locations.status !== "ready" || preferences.status !== "ready") { controller.update(serviceHealth("weather", true, "unknown", "awaiting-check", true)); return; }
    let active = true;
    let request: AbortController | undefined;
    const refresh = async () => {
      request?.abort("replacement"); request = new AbortController();
      const signal = request.signal;
      controller.update(serviceHealth("weather", true, "checking", "awaiting-check", true));
      try {
        const response = await authenticatedFetch("/api/jarvis/connections/weather", undefined, AbortSignal.any([signal, AbortSignal.timeout(10000)]));
        if (!response.ok) throw new Error("weather_unavailable");
        const data = await response.json() as WeatherSnapshot;
        if (!Number.isFinite(data.temperature) || !Number.isFinite(data.feelsLike) || !Number.isFinite(Date.parse(data.retrievedAt))) throw new Error("weather_unavailable");
        if (active && !signal.aborted) {
          setWeather(data);
          controller.update(serviceHealth("weather", true, "online", "verified", true, new Date().toISOString()));
        }
      } catch {
        if (active && !signal.aborted) { setWeather(null); controller.update(serviceHealth("weather", true, "offline", "provider-unavailable", true, new Date().toISOString())); }
      }
    };
    const visibility = () => { if (document.hidden) request?.abort("background"); else void refresh(); };
    const pagehide = () => request?.abort("background");
    void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 5 * 60000);
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", pagehide);
    return () => { active = false; request?.abort("dispose"); clearInterval(timer); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pagehide); };
  }, [controller, userId, locationKey, locations.status, preferences.status]);
  useEffect(() => {
    const previous = controller.getSnapshot().services.find(s => s.id === "home")!;
    const configured = home.phase === "connected" || (home.phase === "unavailable" && previous.enabled);
    controller.update(serviceHealth("home", configured, home.phase === "connected" ? "online" : "offline", home.phase === "connected" ? "verified" : configured ? "provider-unavailable" : "not-configured", false, home.retrievedAt));
    const shortcutTV = shortcuts.records.some(s => s.data.kind === "tv");
    controller.update(serviceHealth("tv", Boolean(home.tv) || shortcutTV, home.tv ? home.tv.online ? "online" : "offline" : "unknown", home.tv ? home.tv.online ? "verified" : "device-offline" : shortcutTV ? "shortcut-unverified" : "not-configured", false, home.retrievedAt));
    const musicConfigured = musicLinks.records.length > 0 || shortcuts.records.some(s => s.data.kind === "music");
    const currentMusic = controller.getSnapshot().services.find(s => s.id === "music")!;
    if (currentMusic.reason !== "verified") controller.update(serviceHealth("music", musicConfigured, "unknown", musicConfigured ? "shortcut-unverified" : "not-configured"));
  }, [controller, home.phase, home.tv, home.retrievedAt, shortcuts.records, musicLinks.records]);
  const setVoiceEnabled = (enabled: boolean) => {
    const current = controller.getSnapshot().services.find(s => s.id === "voice")!;
    if (current.enabled !== enabled) controller.update(serviceHealth("voice", enabled, enabled ? "unknown" : "disabled", enabled ? "awaiting-playback" : "not-enabled", enabled));
  };
  const voiceEvidence = (evidence: VoiceEvidence) => {
    const current = controller.getSnapshot().services.find(s => s.id === "voice")!;
    // Audible device fallback satisfies voice output; it does not verify Fish Audio.
    controller.update(serviceHealth("voice", current.enabled, evidence.kind === "blocked" ? "unknown" : evidence.kind === "browser-error" ? "offline" : "online", evidence.kind === "blocked" ? "gesture-required" : evidence.kind === "browser-error" ? "playback-error" : evidence.fallback ? "device-fallback" : "verified", current.requiredForFullOperation, new Date().toISOString()));
  };
  return <Context.Provider value={{ ...snapshot, controller, weather, home, setVoiceEnabled, voiceEvidence }}>{children}</Context.Provider>;
}
