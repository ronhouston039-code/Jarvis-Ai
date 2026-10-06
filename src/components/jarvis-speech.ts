import { authenticatedFetch } from "../jarvis/client";
import {
  DeviceSpeechController,
  DEVICE_VOICE_FAILURE,
  type DeviceVoicePhase,
  type SpeechCancellationReason,
} from "./device-speech";
export function spokenVersion(text: string): string {
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[`*#_>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = plain.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [plain];
  const brief = sentences.slice(0, 2).join(" ").replace(/\s+/g, " ").trim();
  return brief.length > 900
    ? brief.slice(0, 897).replace(/\s+\S*$/, "") + "…"
    : brief;
}
export type VoiceSpeed = "slow" | "normal" | "fast";
export type VoiceEvidence = { kind: "fish-started" | "device-started" | "blocked" | "browser-error"; fallback: boolean };
export const voiceRates = { slow: 0.85, normal: 1, fast: 1.15 };
const fishFailureLabels = {
  unauthorized: "key missing or invalid",
  "credits-required": "credits or plan issue",
  forbidden: "permission issue",
  "voice-not-found": "voice reference unavailable",
  "rate-limited": "rate or concurrency limit",
  timeout: "request timed out",
  "provider-error": "temporary provider failure",
  unavailable: "provider unavailable",
  "invalid-response": "invalid audio response",
  "missing-key": "server key not configured",
} as const;
export type FishVoiceFailure = {
  category: keyof typeof fishFailureLabels;
  providerStatus?: number;
};
export function safeFishVoiceFailure(body: unknown): FishVoiceFailure | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  if (data.error === "fish_voice_not_connected")
    return { category: "missing-key" };
  if (
    data.provider !== "fish_audio" ||
    typeof data.category !== "string" ||
    !Object.hasOwn(fishFailureLabels, data.category)
  )
    return null;
  return {
    category: data.category as FishVoiceFailure["category"],
    ...(typeof data.providerStatus === "number" &&
    Number.isInteger(data.providerStatus) &&
    data.providerStatus >= 100 &&
    data.providerStatus <= 599
      ? { providerStatus: data.providerStatus }
      : {}),
  };
}
export function fishVoiceFailureText(failure: FishVoiceFailure): string {
  return `Fish Audio${failure.providerStatus ? ` ${failure.providerStatus}` : ""}: ${fishFailureLabels[failure.category]}.`;
}
export class JarvisSpeechPlayer {
  private generation = 0;
  private request?: AbortController;
  private audio?: HTMLAudioElement;
  private url?: string;
  private device: DeviceSpeechController;
  private deviceTestPhase?: (phase: DeviceVoicePhase) => void;
  private fallbackNotice = "";
  private unlockContext?: AudioContext;
  private cancellationReason?: SpeechCancellationReason;
  constructor(
    private state: (speaking: boolean) => void,
    private notice: (message: string) => void,
    private audioChanged: (audio: HTMLAudioElement | null) => void = () => {},
    private preparing: (preparing: boolean) => void = () => {},
    private resumeAudio?: () => void | Promise<void>,
    private providerFailure: (
      failure: FishVoiceFailure | null,
    ) => void = () => {},
    private voiceEvidence: (evidence: VoiceEvidence) => void = () => {},
  ) {
    this.device = new DeviceSpeechController({
      onSpeaking: (active) => this.state(active),
      onPhase: (phase) => {
        this.preparing(phase === "starting");
        this.deviceTestPhase?.(phase);
        if (phase === "started" || phase === "blocked" || phase === "browser-error")
          this.voiceEvidence({ kind: phase === "started" ? "device-started" : phase, fallback: Boolean(this.fallbackNotice) });
      },
      onError: () =>
        this.notice(
          [this.fallbackNotice, DEVICE_VOICE_FAILURE]
            .filter(Boolean)
            .join("\n"),
        ),
      onBackground: () => this.stop("background"),
    });
  }
  /** This method makes native unlock calls synchronously in the caller's tap. */
  primeFromGesture() {
    return this.device.primeFromGesture(() => {
      if (this.resumeAudio) return this.resumeAudio();
      const Constructor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Constructor) return;
      if (!this.unlockContext || this.unlockContext.state === "closed")
        this.unlockContext = new Constructor();
      return this.unlockContext.resume();
    });
  }
  testDeviceVoice(
    onPhase: (phase: DeviceVoicePhase) => void,
    speed: VoiceSpeed = "normal",
  ) {
    this.stop("replacement");
    this.notice("");
    this.deviceTestPhase = onPhase;
    this.primeFromGesture();
    this.device.speak("Device voice is working.", voiceRates[speed]);
  }
  dispose() {
    this.stop("dispose");
    this.device.dispose();
    void this.unlockContext?.close().catch(() => {});
    this.unlockContext = undefined;
  }
  stop(reason: SpeechCancellationReason = "stop") {
    // Record intent before abort/cancel can synchronously fire error callbacks.
    this.cancellationReason = reason;
    this.generation++;
    this.request?.abort(reason);
    this.request = undefined;
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
    }
    this.audio = undefined;
    this.audioChanged(null);
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined;
    this.device.cancel(reason);
    this.deviceTestPhase = undefined;
    this.fallbackNotice = "";
    this.preparing(false);
    this.state(false);
  }
  currentAudio() {
    return this.audio ?? null;
  }
  canSpeakAutomatically() { return !this.cancellationReason && this.device.isPrepared(); }
  greet(speed: VoiceSpeed = "normal") {
    return this.speak(
      "Systems are now fully operational. How can I assist you?",
      speed,
      "greeting",
    );
  }
  async speak(
    text: string,
    speed: VoiceSpeed = "normal",
    source: "reply" | "greeting" = "reply",
  ) {
    this.device.observeLifecycle();
    this.stop("replacement");
    this.cancellationReason = undefined;
    this.providerFailure(null);
    const id = this.generation;
    const spoken = spokenVersion(text);
    if (!spoken) return;
    this.preparing(true);
    this.notice("");
    const request = new AbortController();
    this.request = request;
    let fallbackStarted = false;
    const fallback = () => {
      if (this.cancellationReason || id !== this.generation || fallbackStarted) return;
      fallbackStarted = true;
      if (this.audio) {
        this.audio.onended = null;
        this.audio.onerror = null;
        this.audio.pause();
      }
      this.audio = undefined;
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = undefined;
      this.preparing(true);
      this.audioChanged(null);
      this.fallbackNotice = "Fish Audio unavailable — using device voice.";
      this.notice(this.fallbackNotice);
      this.device.speak(spoken, voiceRates[speed]);
    };
    try {
      const response = await authenticatedFetch(
        source === "greeting" ? "/api/jarvis/voice/greeting" : "/api/tts",
        source === "greeting" ? undefined : { text: spoken },
        request.signal,
      );
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("audio/")
      ) {
        const failure = safeFishVoiceFailure(
          await response.json().catch(() => null),
        );
        if (this.cancellationReason || id !== this.generation) return;
        if (failure) {
          this.providerFailure(failure);
          console.warn("fish_audio_fallback", failure);
        }
        throw new Error("tts_unavailable");
      }
      const blob = await response.blob();
      if (this.cancellationReason || id !== this.generation) return;
      if (!blob.size) throw new Error("empty_audio");
      this.url = URL.createObjectURL(blob);
      const audio = new Audio(this.url);
      this.audio = audio;
      this.audioChanged(audio);
      audio.playbackRate = voiceRates[speed];
      let failed = false;
      const fail = () => {
        if (this.cancellationReason || failed || id !== this.generation) return;
        failed = true;
        audio.pause();
        this.state(false);
        fallback();
      };
      audio.onerror = fail;
      audio.onended = () => {
        if (id === this.generation) {
          this.state(false);
          this.preparing(false);
          this.audioChanged(null);
          this.audio = undefined;
          if (this.url) URL.revokeObjectURL(this.url);
          this.url = undefined;
        }
      };
      await audio.play();
      if (id === this.generation && !failed) {
        this.state(true);
        this.preparing(false);
        this.voiceEvidence({ kind: "fish-started", fallback: false });
      }
    } catch {
      if (!this.cancellationReason && id === this.generation && !request.signal.aborted) fallback();
    } finally {
      if (this.request === request) this.request = undefined;
    }
  }
}
