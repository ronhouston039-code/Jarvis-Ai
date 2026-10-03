import { useEffect, useRef, useState } from "react";
import { useUser } from "deepspace";
import { Button } from "./ui";
import { JarvisSpeechPlayer, type VoiceSpeed } from "./jarvis-speech";
export function FishVoiceSettings() {
  const { user } = useUser();
  const [speed, setSpeed] = useState<VoiceSpeed>(() => {
    try {
      const saved = sessionStorage.getItem(`jarvis-voice-speed:${user?.id}`);
      return saved === "slow" || saved === "fast" ? saved : "normal";
    } catch {
      return "normal";
    }
  });
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("");
  const speaker = useRef<JarvisSpeechPlayer | null>(null);
  if (!speaker.current)
    speaker.current = new JarvisSpeechPlayer(setSpeaking, setStatus);
  useEffect(() => () => speaker.current?.stop(), []);
  return (
    <section aria-label="Fish Audio voice settings">
      <h2>JARVIS SPEAKING VOICE</h2>
      <p>
        Fish Audio voice with device speech fallback. Your API key stays on the
        server. Your short spoken reply is sent to Fish Audio only when speech
        is requested.
      </p>
      <label>
        Voice speed
        <select
          aria-label="Voice speed"
          value={speed}
          onChange={(event) => {
            const next = event.target.value as VoiceSpeed;
            setSpeed(next);
            try {
              sessionStorage.setItem(`jarvis-voice-speed:${user?.id}`, next);
            } catch {
              /* Normal playback works without storage. */
            }
          }}
        >
          <option value="slow">Slow</option>
          <option value="normal">Normal</option>
          <option value="fast">Fast</option>
        </select>
      </label>
      <p>Test phrase: “Good afternoon. Jarvis voice systems are online.”</p>
      <div className="connection-actions">
        <Button
          onClick={() =>
            void speaker.current?.speak(
              "Good afternoon. Jarvis voice systems are online.",
              speed,
            )
          }
        >
          Test voice
        </Button>
        <Button variant="outline" onClick={() => speaker.current?.stop()}>
          Stop
        </Button>
      </div>
      {speaking && <p role="status">Jarvis is speaking…</p>}
      <p role="status">{status}</p>
    </section>
  );
}
