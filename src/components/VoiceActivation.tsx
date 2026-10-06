import { useState } from "react";
import { useAuthStatus } from "deepspace";
import { useSystemHealth } from "./SystemHealthProvider";
export function VoiceActivation() {
  const health = useSystemHealth();
  const { userId } = useAuthStatus();
  const key = `jarvis-voice-feedback:${userId ?? "signed-out"}`;
  const [status, setStatus] = useState("");
  const [speak, setSpeak] = useState(() => {
    try {
      return sessionStorage.getItem(key) === "on";
    } catch {
      return false;
    }
  });
  return (
    <section aria-label="Voice activation settings">
      <label className="settings-toggle-row">
        <span>Speak replies</span>
        <input
          type="checkbox"
          checked={speak}
          onChange={(event) => {
            const enabled = event.target.checked;
            setSpeak(enabled);
            health.setVoiceEnabled(enabled);
            try {
              sessionStorage.setItem(key, enabled ? "on" : "off");
            } catch {
              /* Session storage may be unavailable in private browsers. */
            }
            setStatus(
              enabled
                ? "Spoken replies enabled for this session. If playback is blocked, tap Voice on or Listen in the dashboard."
                : "Automatic spoken replies disabled for this session. Listen remains available.",
            );
          }}
        />
      </label>
      <p className="settings-note">Saved for this browser session. Prepare audio from the dashboard or Test Device Voice.</p>
      <p role="status">{status}</p>
    </section>
  );
}
