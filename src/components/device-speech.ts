import { isIOSSafari } from "./devices/useTVShortcuts";

export const DEVICE_VOICE_FAILURE =
  "Device voice could not start. Tap Test Device Voice and check your audio output.";
export type DeviceVoicePhase =
  | "starting"
  | "started"
  | "completed"
  | "blocked"
  | "browser-error"
  | "cancelled";
export type DeviceVoiceError =
  | "not-allowed"
  | "start-timeout"
  | "completion-timeout"
  | "unavailable"
  | "audio-busy"
  | "audio-hardware"
  | "network"
  | "synthesis-unavailable"
  | "synthesis-failed"
  | "language-unavailable"
  | "voice-unavailable"
  | "browser-error";
export type SpeechCancellationReason =
  | "stop"
  | "replacement"
  | "background"
  | "dispose"
  | "gesture-preparation";
type Callbacks = {
  onPhase: (phase: DeviceVoicePhase) => void;
  onSpeaking: (speaking: boolean) => void;
  onError: (category: DeviceVoiceError) => void;
  onBackground?: () => void;
};
const browserErrors: readonly string[] = [
  "audio-busy",
  "audio-hardware",
  "network",
  "synthesis-unavailable",
  "synthesis-failed",
  "language-unavailable",
  "voice-unavailable",
];

/** Owns one device utterance, its voice loading, and native event lifecycle. */
export class DeviceSpeechController {
  private generation = 0;
  private active = false;
  private utterance?: SpeechSynthesisUtterance;
  private primer?: SpeechSynthesisUtterance;
  private startTimer?: ReturnType<typeof setTimeout>;
  private endTimer?: ReturnType<typeof setTimeout>;
  private voicesTimer?: ReturnType<typeof setTimeout>;
  private removeVoices?: () => void;
  private removeVisibility?: () => void;
  private needsGesture = true;
  private cancellationReason?: SpeechCancellationReason;
  constructor(private callbacks: Callbacks) {}

  private ios() {
    return (
      typeof navigator !== "undefined" &&
      isIOSSafari({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
        standalone: (navigator as Navigator & { standalone?: boolean })
          .standalone,
      })
    );
  }
  private watchVisibility() {
    if (this.removeVisibility) return;
    const background = () => {
      this.needsGesture = true;
      this.cancel("background");
      this.callbacks.onBackground?.();
    };
    const visibility = () => {
      if (document.hidden) background();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", background);
    this.removeVisibility = () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", background);
    };
  }
  observeLifecycle() {
    this.watchVisibility();
  }
  isPrepared() { return !this.needsGesture && !document.hidden; }
  /** Invoke only from a real click/tap. No promises precede native unlock calls. */
  primeFromGesture(resumeAudio: () => void | Promise<void>): boolean {
    this.watchVisibility();
    if (
      document.hidden ||
      (navigator.userActivation && !navigator.userActivation.isActive)
    )
      return false;
    try {
      const resumed = resumeAudio();
      if (resumed)
        void resumed.catch(() => {
          // AudioContext analysis can fail independently of native device speech.
          console.warn("device_voice", "audio-context-unavailable");
        });
    } catch {
      console.warn("device_voice", "audio-context-unavailable");
    }
    try {
      const synthesis = window.speechSynthesis;
      if (!synthesis) return false;
      // Stop the previous turn before priming; a muted space unlocks the engine.
      this.cancel("gesture-preparation");
      const primer = new SpeechSynthesisUtterance(" ");
      primer.lang = "en-US";
      primer.volume = 0;
      this.primer = primer;
      const clear = () => {
        if (this.primer === primer) this.primer = undefined;
      };
      primer.onend = clear;
      primer.onerror = clear;
      synthesis.speak(primer);
      synthesis.resume?.();
      this.needsGesture = false;
      return true;
    } catch {
      console.warn("device_voice", "initialization-error");
      return false;
    }
  }
  private voices(): SpeechSynthesisVoice[] {
    try {
      return window.speechSynthesis.getVoices?.() ?? [];
    } catch {
      return [];
    }
  }
  private clearPending() {
    clearTimeout(this.startTimer);
    clearTimeout(this.endTimer);
    clearTimeout(this.voicesTimer);
    this.startTimer = undefined;
    this.endTimer = undefined;
    this.voicesTimer = undefined;
    this.removeVoices?.();
    this.removeVoices = undefined;
    if (this.utterance) {
      this.utterance.onstart = null;
      this.utterance.onend = null;
      this.utterance.onerror = null;
    }
    this.utterance = undefined;
    if (this.primer) {
      this.primer.onend = null;
      this.primer.onerror = null;
    }
    this.primer = undefined;
  }
  cancel(reason: SpeechCancellationReason = "stop") {
    this.cancellationReason = reason;
    this.generation++;
    const wasActive = this.active;
    this.active = false;
    this.clearPending();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* Already unavailable. */
    }
    this.callbacks.onSpeaking(false);
    if (wasActive) this.callbacks.onPhase("cancelled");
  }
  speak(text: string, rate = 1): void {
    this.watchVisibility();
    this.cancel("replacement");
    if (!text.trim()) return;
    const id = this.generation;
    this.cancellationReason = undefined;
    this.active = true;
    const fail = (category: DeviceVoiceError, blocked = false) => {
      if (this.cancellationReason || id !== this.generation || !this.active) return;
      this.active = false;
      this.clearPending();
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* No output to cancel. */
      }
      this.callbacks.onSpeaking(false);
      this.callbacks.onPhase(blocked ? "blocked" : "browser-error");
      console.warn("device_voice", category);
      this.callbacks.onError(category);
    };
    if (document.hidden || (this.ios() && this.needsGesture)) {
      fail("not-allowed", true);
      return;
    }
    if (!window.speechSynthesis) {
      fail("unavailable");
      return;
    }
    this.callbacks.onPhase("starting");
    const start = () => {
      if (id !== this.generation || !this.active || this.utterance) return;
      clearTimeout(this.voicesTimer);
      this.removeVoices?.();
      this.removeVoices = undefined;
      try {
        const voices = this.voices();
        const utterance = new SpeechSynthesisUtterance(text);
        this.utterance = utterance; // Safari must retain the active utterance.
        utterance.lang = "en-US";
        utterance.voice =
          voices.find((v) => /^en-US$/i.test(v.lang)) ??
          voices.find((v) => /^en(?:[-_]|$)/i.test(v.lang)) ??
          null;
        utterance.rate = Number.isFinite(rate)
          ? Math.min(1, Math.max(0.95, rate))
          : 1;
        utterance.pitch = 1;
        utterance.volume = 1;
        let started = false;
        utterance.onstart = () => {
          if (
            id !== this.generation ||
            !this.active ||
            this.utterance !== utterance
          )
            return;
          started = true;
          clearTimeout(this.startTimer);
          this.callbacks.onSpeaking(true);
          this.callbacks.onPhase("started");
          this.endTimer = setTimeout(() => fail("completion-timeout"), 120000);
        };
        utterance.onend = () => {
          if (
            id !== this.generation ||
            !this.active ||
            this.utterance !== utterance
          )
            return;
          if (!started) {
            fail("start-timeout", true);
            return;
          }
          this.active = false;
          this.clearPending();
          this.callbacks.onSpeaking(false);
          this.callbacks.onPhase("completed");
        };
        utterance.onerror = (event) => {
          if (this.cancellationReason || id !== this.generation || this.utterance !== utterance) return;
          const category =
            event.error === "not-allowed"
              ? "not-allowed"
              : browserErrors.includes(event.error)
                ? (event.error as DeviceVoiceError)
                : "browser-error";
          fail(category, category === "not-allowed");
        };
        this.startTimer = setTimeout(() => fail("start-timeout", true), 2000);
        window.speechSynthesis.resume?.();
        window.speechSynthesis.speak(utterance);
      } catch {
        fail("browser-error");
      }
    };
    const synthesis = window.speechSynthesis;
    if (this.voices().length || typeof synthesis.getVoices !== "function") {
      start();
      return;
    }
    const voicesChanged = () => {
      if (this.voices().length) start();
    };
    if (typeof synthesis.addEventListener === "function") {
      synthesis.addEventListener("voiceschanged", voicesChanged);
      this.removeVoices = () =>
        synthesis.removeEventListener("voiceschanged", voicesChanged);
    } else {
      const previous = synthesis.onvoiceschanged;
      const listener = (event: Event) => {
        previous?.call(synthesis, event);
        voicesChanged();
      };
      synthesis.onvoiceschanged = listener;
      this.removeVoices = () => {
        if (synthesis.onvoiceschanged === listener)
          synthesis.onvoiceschanged = previous;
      };
    }
    this.voicesTimer = setTimeout(start, 1500);
    voicesChanged(); // Close the race between the first lookup and listener setup.
  }
  dispose() {
    this.cancel("dispose");
    this.removeVisibility?.();
    this.removeVisibility = undefined;
    this.needsGesture = true;
  }
}
