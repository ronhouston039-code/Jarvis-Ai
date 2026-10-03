import { useState } from "react";
import { useQuery } from "deepspace";
import { authenticatedFetch } from "../jarvis/client";
import { Button } from "./ui";
const defaults = { dailyBriefing: true, calendarAlerts: true, weatherAlerts: true, focusBlocks: "ask", emailReminders: false, marketing: false, quietStart: "22:00", quietEnd: "07:00" };
type Policy = typeof defaults;
type Preference = { timezone: string; responseMode: string; proactive?: string };
export function ProactivePreferences() {
  const { records } = useQuery<Preference>("preferences", { limit: 1 });
  const [draft, setDraft] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const saved = records[0]?.data;
  let policy = defaults;
  try { if (saved?.proactive) policy = { ...defaults, ...JSON.parse(saved.proactive) }; } catch { /* Older preferences may have no policy. */ }
  const value = draft ?? policy;
  const update = (patch: Partial<Policy>) => setDraft({ ...value, ...patch });
  async function save() {
    setBusy(true); setStatus("");
    try {
      const response = await authenticatedFetch("/api/jarvis/preferences", { timezone: saved?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, responseMode: saved?.responseMode ?? "normal", proactive: JSON.stringify(value) });
      setStatus(response.ok ? "Preferences saved. Scheduled proactive services are not active yet." : "Could not save preferences. Please try again.");
    } catch { setStatus("Could not connect. Please try again."); } finally { setBusy(false); }
  }
  return <section aria-label="Proactive assistance">
    <h2>PROACTIVE ASSISTANCE</h2>
    <p>Choose how you want JARVIS to help. These are saved preferences; proactive delivery is not active yet. Calendar and email also require connected providers.</p>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {([ ["dailyBriefing", "Daily briefing"], ["calendarAlerts", "Calendar and deadline alerts"], ["weatherAlerts", "Weather alerts"], ["emailReminders", "Email reminders"], ["marketing", "Marketing and product tips"] ] as const).map(([key, label]) => <label key={key} className="connection-actions"><span>{label}</span><select aria-label={label} disabled={busy} value={value[key] ? "on" : "off"} onChange={(event) => update({ [key]: event.target.value === "on" })}><option value="on">On</option><option value="off">Off</option></select></label>)}
      <label className="connection-actions">Suggested focus blocks<select aria-label="Suggested focus blocks" disabled={busy} value={value.focusBlocks} onChange={(event) => update({ focusBlocks: event.target.value })}><option value="ask">Ask first</option><option value="off">Off</option></select></label>
      <div className="connection-actions"><label>Quiet hours start<input type="time" required value={value.quietStart} disabled={busy} onChange={(event) => update({ quietStart: event.target.value })} /></label><label>Quiet hours end<input type="time" required value={value.quietEnd} disabled={busy} onChange={(event) => update({ quietEnd: event.target.value })} /></label></div>
      <p>Quiet hours use your saved timezone. Existing reminder delivery is unchanged until quiet-hour scheduling is implemented.</p>
      <Button type="submit" disabled={busy}>Save proactive preferences</Button>
      <p role="status">{status}</p>
    </form>
  </section>;
}
