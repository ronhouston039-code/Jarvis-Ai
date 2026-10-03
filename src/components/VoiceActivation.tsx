import { useState } from "react";
import { useUser } from "deepspace";
import { Button } from "./ui";
export function VoiceActivation() {
  const { user } = useUser();
  const key = `jarvis-voice-feedback:${user?.id ?? "signed-out"}`;
  const [sound, setSound] = useState(true);
  const [consent, setConsent] = useState(false);
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
      <h2>VOICE ACTIVATION</h2>
      <Button variant="outline" onClick={() => setConsent(true)}>
        Enable “Hey Jarvis”
      </Button>
      <p>
        JARVIS listens only while this app is open. Wake-word activation is not
        configured yet.
      </p>
      <p>
        Wake phrase: <strong>Hey Jarvis</strong>{" "}
        <Button
          variant="outline"
          onClick={() =>
            setStatus(
              "Changing the phrase requires a compatible Porcupine keyword model. No wake-word model is connected yet.",
            )
          }
        >
          Change
        </Button>
      </p>
      <h3>Voice feedback</h3>
      <label className="connection-actions">
        <input
          type="checkbox"
          checked={sound}
          onChange={(event) => setSound(event.target.checked)}
        />
        Sound on detection
      </label>
      <small>
        Preview setting only; no detection tone runs until wake-word setup is
        complete.
      </small>
      <label className="connection-actions">
        <input
          type="checkbox"
          checked={speak}
          onChange={(event) => {
            const enabled = event.target.checked;
            setSpeak(enabled);
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
        Speak replies
      </label>
      <p>
        Device voice works after you tap Voice on in the dashboard. This
        preference applies to this browser session.
      </p>
      <Button
        variant="outline"
        onClick={() =>
          setStatus(
            "Wake-phrase testing is unavailable until Picovoice access and a compatible keyword model are configured. No microphone access was requested.",
          )
        }
      >
        Test wake phrase
      </Button>
      {consent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enable Hey Jarvis confirmation"
          className="personal-card"
        >
          <div>
            <h3>Enable “Hey Jarvis”?</h3>
            <p>
              Once configured, JARVIS will use your microphone to listen locally
              for the wake phrase while this app is open. Continuous wake-word
              audio will not be sent for transcription. After detection, your
              request may be processed by your speech-to-text provider.
            </p>
            <p>
              Setup required: Picovoice access and a compatible wake-word model.
              Microphone access will not be requested until setup is complete.
            </p>
            <div className="connection-actions">
              <Button variant="outline" onClick={() => setConsent(false)}>
                Not now
              </Button>
              <Button disabled>Enable</Button>
            </div>
          </div>
        </div>
      )}
      <p role="status">{status}</p>
    </section>
  );
}
