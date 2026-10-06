import { expect, test } from "vitest";
import { SystemHealthController, serviceHealth, healthSummary, spokenHealth } from "./system-health";
const time = "2026-10-05T12:00:00Z";
function setup() {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
  return { controller: new SystemHealthController("alice", storage, storage), storage };
}
function online(controller: SystemHealthController) { controller.update(serviceHealth("cloud", true, "online", "verified", true, time)); }
test("fully operational requires every enabled required check to be online", () => {
  const { controller } = setup(); online(controller);
  controller.update(serviceHealth("voice", true, "unknown", "awaiting-playback", true));
  expect(healthSummary(controller.getSnapshot().services).state).toBe("checking");
  expect(controller.takeAnnouncement()).toBeNull();
  controller.update(serviceHealth("voice", true, "online", "verified", true, time));
  expect(healthSummary(controller.getSnapshot().services).text).toBe("SYSTEMS FULLY OPERATIONAL");
  expect(spokenHealth(controller.getSnapshot().services)).toBe("Systems are fully operational, Sir.");
});
test.each(["weather", "map"] as const)("%s real failure, unchanged refresh, and recovery produce one entry and warning per transition", id => {
  const { controller } = setup(); online(controller);
  const outage = serviceHealth(id, true, "offline", "provider-unavailable", true, time);
  controller.update(outage);
  expect(healthSummary(controller.getSnapshot().services).affected.map(s => s.id)).toEqual([id]);
  expect(controller.takeAnnouncement()).toContain(id === "weather" ? "Weather updates are offline" : "Location map is offline");
  expect(controller.takeAnnouncement()).toBeNull();
  controller.update(serviceHealth(id, true, "checking", "awaiting-check", true));
  controller.update({ ...outage, checkedAt: "2026-10-05T12:05:00Z" });
  expect(controller.takeAnnouncement()).toBeNull();
  expect(controller.getSnapshot().activity).toHaveLength(1);
  controller.update(serviceHealth(id, true, "online", "verified", true, time));
  expect(controller.takeAnnouncement()).toBe("Systems are fully operational again, Sir.");
  expect(controller.takeAnnouncement()).toBeNull();
  expect(controller.getSnapshot().activity.map(x => x.status)).toEqual(["online", "offline"]);
});
test("combined map/weather warning has exact wording after checks finish", () => {
  const { controller } = setup(); online(controller);
  controller.update(serviceHealth("map", true, "checking", "awaiting-check", true));
  controller.update(serviceHealth("weather", true, "offline", "provider-unavailable", true, time));
  expect(controller.takeAnnouncement()).toBeNull();
  controller.update(serviceHealth("map", true, "offline", "provider-unavailable", true, time));
  expect(controller.takeAnnouncement()).toBe("Systems are not fully operational, Sir. Map locations are offline and weather updates are offline.");
  expect(controller.takeAnnouncement()).toBeNull();
});
test("disabled optional services and denied location permission are not outages", () => {
  const { controller } = setup(); online(controller);
  controller.update(serviceHealth("map", false, "offline", "not-implemented"));
  controller.update(serviceHealth("weather", false, "offline", "not-enabled"));
  controller.update(serviceHealth("map", true, "offline", "permission-denied", false));
  expect(healthSummary(controller.getSnapshot().services).state).toBe("online");
  expect(controller.getSnapshot().activity).toHaveLength(0);
  expect(controller.takeAnnouncement()).toBeNull();
});
test.each(["Stop", "replacement", "background", "pagehide"])("%s cancellation cannot create an outage or activity", () => {
  const { controller } = setup(); online(controller);
  controller.update(serviceHealth("voice", true, "offline", "playback-error", true, time), "cancelled");
  expect(controller.getSnapshot().activity).toHaveLength(0);
  expect(controller.takeAnnouncement()).toBeNull();
});
test("degraded fallback is evidence distinct from unavailable/disabled and does not duplicate", () => {
  const { controller } = setup(); online(controller);
  controller.update(serviceHealth("voice", true, "degraded", "device-fallback", true, time));
  expect(controller.takeAnnouncement()).toContain("Voice output is degraded");
  controller.update(serviceHealth("voice", true, "degraded", "device-fallback", true, time));
  expect(controller.takeAnnouncement()).toBeNull();
  expect(controller.getSnapshot().activity).toHaveLength(1);
  controller.update(serviceHealth("voice", true, "unknown", "gesture-required", true));
  expect(controller.getSnapshot().activity).toHaveLength(1);
});
test("history and warning session state are isolated and survive same-account navigation/reload", () => {
  const { controller, storage } = setup(); online(controller);
  controller.update(serviceHealth("weather", true, "offline", "provider-unavailable", true, time));
  controller.takeAnnouncement();
  const same = new SystemHealthController("alice", storage, storage);
  online(same); same.update(serviceHealth("weather", true, "offline", "provider-unavailable", true, time));
  expect(same.takeAnnouncement()).toBeNull();
  expect(same.getSnapshot().activity).toHaveLength(1);
  const other = new SystemHealthController("bob", storage, storage);
  expect(other.getSnapshot().activity).toEqual([]);
});
test("public messages and restored history never use stored/provider diagnostics", () => {
  const { storage } = setup();
  storage.setItem("jarvis-system-activity:alice", JSON.stringify([{ id: "event-1", service: "weather", status: "offline", timestamp: time, message: "private provider token" }]));
  const controller = new SystemHealthController("alice", storage);
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("private provider token");
  const data = serviceHealth("weather", true, "offline", "provider-unavailable", true, time);
  controller.update({ ...data, message: "raw secret diagnostic" });
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("raw secret diagnostic");
});

test("recovery remains pending across an overlapping required check", () => {
  const { controller } = setup(); online(controller);
  controller.update(serviceHealth("weather", true, "offline", "provider-unavailable", true, time));
  controller.takeAnnouncement();
  controller.update(serviceHealth("cloud", true, "checking", "awaiting-check", true));
  controller.update(serviceHealth("weather", true, "online", "verified", true, time));
  expect(controller.takeAnnouncement()).toBeNull();
  online(controller);
  expect(controller.takeAnnouncement()).toBe("Systems are fully operational again, Sir.");
});
