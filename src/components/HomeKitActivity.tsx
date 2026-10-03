import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../jarvis/client";
import { Button } from "./ui";
type Event = {
  id: string;
  deviceName: string;
  actionType: string;
  state: string;
  timestamp: string;
  message: string;
};
export function HomeKitActivity({ compact = false }: { compact?: boolean }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [status, setStatus] = useState("");
  const refresh = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/homekit/audit");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { events: Event[] };
      setEvents(data.events);
      setStatus("");
    } catch {
      setStatus("Could not load Apple Home activity.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  return (
    <section aria-label="Apple Home activity log" className="personal-card">
      <div>
        <h2>Apple Home activity</h2>
        <p>
          Reported by your signed-in iPhone companion. HomeKit data stays on the
          phone.
        </p>
        <Button onClick={() => void refresh()}>Refresh activity</Button>
        <p role="status">{status}</p>
        {!events.length && <p>No local Apple Home actions reported yet.</p>}
        {(compact ? events.slice(0, 3) : events).map((event) => (
          <article key={event.id}>
            <h3>
              {event.deviceName} · {event.actionType.replace(/_/g, " ")} ·{" "}
              {event.state === "completed" ? "Completed" : "Failed"}
            </h3>
            <p>
              {compact &&
              Date.now() - Date.parse(event.timestamp) >= 0 &&
              Date.now() - Date.parse(event.timestamp) < 60000 &&
              event.message === "Verified on by Apple Home readback."
                ? `${event.deviceName} is on. Verified by the iPhone companion.`
                : compact &&
                    Date.now() - Date.parse(event.timestamp) >= 0 &&
                    Date.now() - Date.parse(event.timestamp) < 60000 &&
                    event.message === "Verified off by Apple Home readback."
                  ? `${event.deviceName} is off. Verified by the iPhone companion.`
                  : event.message}
            </p>
            <time dateTime={event.timestamp}>
              {new Date(event.timestamp).toLocaleString()}
            </time>
          </article>
        ))}
      </div>
    </section>
  );
}
