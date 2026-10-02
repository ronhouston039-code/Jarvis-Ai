import { useState } from "react";
import { getAuthToken } from "deepspace";
import { Input, Button } from "./ui";

export function JarvisPreferences() {
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [responseMode, setMode] = useState<"normal" | "brief" | "technical">(
    "normal",
  );
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
        body: JSON.stringify({ timezone, responseMode }),
      });
      setStatus(
        response.ok
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
    <form
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
      <Button disabled={busy} type="submit">
        Save preferences
      </Button>
      <p role="status" className="mt-3 muted text-sm">
        {status}
      </p>
    </form>
  );
}
