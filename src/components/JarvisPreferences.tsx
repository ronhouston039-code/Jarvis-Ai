import { useState } from "react";
import { getAuthToken, useQuery } from "deepspace";
import { Input, Button } from "./ui";
import { resolveTemperatureUnit, type TemperatureUnit } from "../jarvis/contracts";

export function JarvisPreferences() {
  const { records, status: queryStatus } = useQuery<{ timezone: string; responseMode: "normal" | "brief" | "technical"; temperatureUnit?: string }>("preferences", { limit: 1 });
  const saved = records[0]?.data;
  const [draftTimezone, setTimezone] = useState<string | null>(null);
  const [draftMode, setMode] = useState<"normal" | "brief" | "technical" | null>(null);
  const timezone = draftTimezone ?? saved?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const responseMode = draftMode ?? saved?.responseMode ?? "normal";
  const [draftUnit, setUnit] = useState<TemperatureUnit | null>(null);
  const temperatureUnit = draftUnit ?? resolveTemperatureUnit(saved?.temperatureUnit);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setStatus("");
    try {
      const token = await getAuthToken();
      const response = await fetch("/api/jarvis/preferences", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ timezone, responseMode, temperatureUnit }),
      });
      const result = await response.json() as { success?: boolean };
      setStatus(
        response.ok && result.success === true
          ? "Preferences saved."
          : "Could not save preferences. Check the timezone and try again.",
      );
    } catch {
      setStatus("Could not connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form aria-label="Personal preferences"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor="timezone" className="block mb-2 text-sm">
        Your timezone
      </label>
      <Input
        id="timezone"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        required
        maxLength={100}
      />
      <div
        className="flex gap-4 py-4"
        role="radiogroup"
        aria-label="Response style"
      >
        {(["normal", "brief", "technical"] as const).map((mode) => (
          <label key={mode} className="flex gap-2 text-sm capitalize">
            <input
              type="radio"
              name="response-mode"
              checked={responseMode === mode}
              onChange={() => setMode(mode)}
            />
            {mode}
          </label>
        ))}
      </div>
      <Button disabled={busy || queryStatus !== "ready"} type="submit">
        Save preferences
      </Button>
      <label className="settings-row">Temperature
        <select aria-label="Temperature" value={temperatureUnit} disabled={busy || queryStatus !== "ready"} onChange={e => setUnit(e.target.value as TemperatureUnit)}>
          <option value="fahrenheit">Fahrenheit</option><option value="celsius">Celsius</option>
        </select>
      </label>
      <p role="status" className="mt-3 muted text-sm">
        {status}
      </p>
    </form>
  );
}
