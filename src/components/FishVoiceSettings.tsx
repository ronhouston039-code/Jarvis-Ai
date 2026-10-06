import { useEffect, useRef, useState } from "react";
import { useSystemHealth } from "./SystemHealthProvider";
import { useAuthStatus } from "deepspace";
import { Button } from "./ui";
import {
  JarvisSpeechPlayer,
  fishVoiceFailureText,
  type FishVoiceFailure,
  type VoiceSpeed,
} from "./jarvis-speech";
import type { DeviceVoicePhase } from "./device-speech";
export function FishVoiceSettings() {
  const health = useSystemHealth();
  const { userId } = useAuthStatus();
  const [speed, setSpeed] = useState<VoiceSpeed>(() => {
    try {
      const saved = sessionStorage.getItem(`jarvis-voice-speed:${userId}`);
      return saved === "slow" || saved === "fast" ? saved : "normal";
    } catch {
      return "normal";
    }
  });
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("");
  const [devicePhase, setDevicePhase] = useState<DeviceVoicePhase | null>(null);
  const [providerFailure, setProviderFailure] =
    useState<FishVoiceFailure | null>(null);
  const speaker = useRef<JarvisSpeechPlayer | null>(null);
  if (!speaker.current)
    speaker.current = new JarvisSpeechPlayer(
      setSpeaking,
      setStatus,
      undefined,
      undefined,
      undefined,
      setProviderFailure,
      health.voiceEvidence,
    );
  useEffect(() => () => speaker.current?.dispose(), []);
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
              sessionStorage.setItem(`jarvis-voice-speed:${userId}`, next);
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
          onClick={() => {
            speaker.current?.primeFromGesture();
            void speaker.current?.speak(
              "Good afternoon. Jarvis voice systems are online.",
              speed,
            );
          }}
        >
          Test voice
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            speaker.current?.testDeviceVoice(setDevicePhase, speed);
          }}
        >
          Test Device Voice
        </Button>
        <Button variant="outline" onClick={() => speaker.current?.stop()}>
          Stop
        </Button>
      </div>
      {speaking && <p role="status">Jarvis is speaking…</p>}
      {devicePhase && (
        <p role="status" aria-label="Device voice test status">
          {devicePhase === "starting"
            ? "Waiting for device voice…"
            : devicePhase === "started"
              ? "Device voice started."
              : devicePhase === "completed"
                ? "Device voice completed."
                : devicePhase === "blocked"
                  ? "Device voice blocked."
                  : devicePhase === "browser-error"
                    ? "Device voice browser error."
                    : "Device voice cancelled."}
        </p>
      )}
      <p role="status">{status}</p>
      {providerFailure && (
        <p role="status" aria-label="Fish Audio failure status">
          {fishVoiceFailureText(providerFailure)}
        </p>
      )}
    </section>
  );
}
