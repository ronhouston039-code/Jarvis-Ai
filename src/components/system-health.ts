export type ServiceId = "cloud" | "voice" | "weather" | "map" | "home" | "tv" | "music";
export type HealthStatus = "online" | "offline" | "degraded" | "disabled" | "unknown" | "checking";
export type HealthReason = "verified" | "not-enabled" | "not-implemented" | "not-configured" | "provider-unavailable" | "device-offline" | "awaiting-check" | "awaiting-playback" | "shortcut-unverified" | "device-fallback" | "playback-error" | "gesture-required" | "permission-denied" | "renderer-unavailable";
export type ServiceHealth = {
  id: ServiceId; label: string; enabled: boolean; requiredForFullOperation: boolean;
  status: HealthStatus; checkedAt: string | null; reason: HealthReason; message: string;
};
export type HealthActivity = { id: string; service: ServiceId; status: "offline" | "degraded" | "online"; timestamp: string; message: string };
export type HealthSnapshot = { services: ServiceHealth[]; activity: HealthActivity[] };
const labels: Record<ServiceId, string> = { cloud: "Cloud connection", voice: "Voice output", weather: "Weather updates", map: "Location map", home: "Smart Home", tv: "TV", music: "Music" };
const reasons: Record<HealthReason, string> = {
  verified: "Verified by an actual service response.", "not-enabled": "Turned off.",
  "not-implemented": "Not available in this release.", "not-configured": "Not connected.",
  "provider-unavailable": "Service could not be reached.", "device-offline": "Approved device is offline.",
  "awaiting-check": "Waiting for a real check.", "awaiting-playback": "Awaiting audible playback.",
  "shortcut-unverified": "Shortcut configured; device state is unverified.", "device-fallback": "Fish Audio unavailable — using device voice.",
  "playback-error": "Voice output could not start.", "gesture-required": "Tap Test Device Voice to prepare audio.",
  "renderer-unavailable": "Map rendering is unavailable in this browser.",
  "permission-denied": "Optional permission is not enabled.",
};
export function serviceHealth(id: ServiceId, enabled = false, status: HealthStatus = "disabled", reason: HealthReason = "not-enabled", requiredForFullOperation = false, checkedAt: string | null = null): ServiceHealth {
  // Permission/gesture restrictions and disabled features are not provider outages.
  const state = !enabled ? "disabled" : reason === "permission-denied" || reason === "gesture-required" ? "unknown" : status;
  return { id, label: labels[id], enabled, requiredForFullOperation: enabled && requiredForFullOperation, status: state, checkedAt, reason, message: reasons[reason] };
}
export const isOutage = (s: ServiceHealth) => s.enabled && (s.status === "offline" || s.status === "degraded");
export function healthSummary(services: ServiceHealth[]) {
  const required = services.filter(s => s.enabled && s.requiredForFullOperation);
  const affected = required.filter(isOutage);
  const state = affected.length ? "affected" : required.length && required.every(s => s.status === "online") ? "online" : "checking";
  return { state, affected, text: state === "online" ? "SYSTEMS FULLY OPERATIONAL" : state === "affected" ? "SYSTEMS NOT FULLY OPERATIONAL, SIR." : "SYSTEM STATUS NOT YET VERIFIED" };
}
export function spokenHealth(services: ServiceHealth[]) {
  const { state, affected } = healthSummary(services);
  if (affected.some(s => s.id === "map" && s.status === "offline") && affected.some(s => s.id === "weather" && s.status === "offline"))
    return "Systems are not fully operational, Sir. Map locations are offline and weather updates are offline.";
  if (state === "online") return "Systems are fully operational, Sir.";
  if (state === "checking") return "System status is not fully verified yet, Sir.";
  return `Systems are not fully operational, Sir. ${affected.map(s => `${s.label} ${s.id === "weather" ? "are" : "is"} ${s.status === "degraded" ? "degraded" : "offline"}`).join("; ")}.`;
}
const statuses = ["online", "offline", "degraded"] as const;
/** One per-account controller owns health, bounded local history, and warning deduplication. */
export class SystemHealthController {
  private snapshot: HealthSnapshot;
  private listeners = new Set<() => void>();
  private warned = new Set<string>();
  private lastSummary = "checking";
  private recoveryPending = false;
  constructor(private userId: string, private storage?: Pick<Storage, "getItem" | "setItem">, private session?: Pick<Storage, "getItem" | "setItem">) {
    try {
      const saved: unknown = JSON.parse(session?.getItem(`jarvis-system-warnings:${encodeURIComponent(userId)}`) ?? "[]");
      if (Array.isArray(saved)) this.warned = new Set(saved.filter((x): x is string => typeof x === "string" && /^(cloud|voice|weather|map|home|tv|music):(offline|degraded)$/.test(x)));
    } catch { /* Session storage is optional. */ }
    let activity: HealthActivity[] = [];
    try {
      const values: unknown = JSON.parse(storage?.getItem(this.storageKey()) ?? "[]");
      if (Array.isArray(values)) activity = values.slice(0, 40).filter((x): x is HealthActivity => !!x && typeof x === "object" && Object.hasOwn(labels, x.service) && statuses.includes(x.status) && typeof x.id === "string" && /^[\w-]{1,100}$/.test(x.id) && typeof x.timestamp === "string" && Number.isFinite(Date.parse(x.timestamp))).map(x => ({ id: x.id, service: x.service, status: x.status, timestamp: x.timestamp, message: this.activityMessage(x.service, x.status) }));
    } catch { /* Storage is optional; never trust stored messages. */ }
    this.snapshot = { services: Object.keys(labels).map(id => serviceHealth(id as ServiceId, false, "disabled", id === "map" ? "not-implemented" : "not-enabled")), activity };
  }
  private storageKey() { return `jarvis-system-activity:${encodeURIComponent(this.userId)}`; }
  private activityMessage(id: ServiceId, status: HealthActivity["status"]) { return `${labels[id]} · ${status === "online" ? "Recovered" : status === "offline" ? "Offline" : "Degraded"}`; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  update(next: ServiceHealth, cause: "observation" | "cancelled" = "observation") {
    if (cause === "cancelled") return;
    // Recreate all public text from allow-listed fields, never provider strings.
    next = serviceHealth(next.id, next.enabled, next.status, next.reason, next.requiredForFullOperation, next.checkedAt);
    const previous = this.snapshot.services.find(s => s.id === next.id)!;
    // Refreshing an outage is not a recovery or a new outage episode.
    if (next.status === "checking" && isOutage(previous)) return;
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    const recovering = isOutage(previous) && next.enabled && next.status === "online";
    const newlyAffected = isOutage(next) && (!isOutage(previous) || previous.status !== next.status);
    const activity = [...this.snapshot.activity];
    const lastActivity = activity.find(entry => entry.service === next.id);
    if ((newlyAffected || recovering) && lastActivity?.status !== next.status) {
      activity.unshift({ id: crypto.randomUUID(), service: next.id, status: next.status as HealthActivity["status"], timestamp: next.checkedAt ?? new Date().toISOString(), message: this.activityMessage(next.id, next.status as HealthActivity["status"]) });
      activity.splice(40);
      try { this.storage?.setItem(this.storageKey(), JSON.stringify(activity)); } catch { /* Private mode remains usable. */ }
    }
    if (next.status === "online" || !next.enabled) for (const key of [...this.warned]) if (key.startsWith(`${next.id}:`)) this.warned.delete(key);
    this.saveWarnings();
    this.snapshot = { services: this.snapshot.services.map(s => s.id === next.id ? next : s), activity };
    const summary = healthSummary(this.snapshot.services).state;
    if (this.lastSummary === "affected" && summary === "online") this.recoveryPending = true;
    if (summary === "affected") this.recoveryPending = false;
    if (summary !== "checking") this.lastSummary = summary;
    this.listeners.forEach(listener => listener());
  }
  takeAnnouncement(): string | null {
    const required = this.snapshot.services.filter(s => s.enabled && s.requiredForFullOperation);
    if (required.some(s => s.status === "unknown" || s.status === "checking")) return null;
    const affected = required.filter(isOutage);
    if (affected.some(s => !this.warned.has(`${s.id}:${s.status}`))) {
      affected.forEach(s => this.warned.add(`${s.id}:${s.status}`));
      this.saveWarnings();
      return spokenHealth(this.snapshot.services);
    }
    if (!affected.length && this.recoveryPending) { this.recoveryPending = false; return "Systems are fully operational again, Sir."; }
    return null;
  }
  private saveWarnings() {
    try { this.session?.setItem(`jarvis-system-warnings:${encodeURIComponent(this.userId)}`, JSON.stringify([...this.warned])); } catch { /* Session memory still deduplicates. */ }
  }
}
