import { authenticatedFetch } from "../jarvis/client";
export function spokenVersion(text: string): string {
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[`*#_>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = plain.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [plain];
  const brief = sentences.slice(0, 3).join(" ").replace(/\s+/g, " ").trim();
  return brief.length > 900
    ? brief.slice(0, 897).replace(/\s+\S*$/, "") + "…"
    : brief;
}
export type VoiceSpeed = "slow" | "normal" | "fast";
export const voiceRates = { slow: 0.85, normal: 1, fast: 1.15 };
export class JarvisSpeechPlayer {
  private generation = 0;
  private request?: AbortController;
  private audio?: HTMLAudioElement;
  private url?: string;
  constructor(
    private state: (speaking: boolean) => void,
    private notice: (message: string) => void,
  ) {}
  stop() {
    this.generation++;
    this.request?.abort();
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
    }
    this.audio = undefined;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined;
    window.speechSynthesis?.cancel();
    this.state(false);
  }
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
    this.stop();
    const id = this.generation;
    const spoken = spokenVersion(text);
    if (!spoken) return;
    this.notice("");
    const request = new AbortController();
    this.request = request;
    let fallbackStarted = false;
    const fallback = () => {
      if (id !== this.generation || fallbackStarted) return;
      fallbackStarted = true;
      if (!window.speechSynthesis) {
        this.notice("Speech is unavailable. You can still read the reply.");
        return;
      }
      this.notice("Fish Audio is unavailable. Using your device voice.");
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.lang = navigator.language || "en-US";
      utterance.rate = voiceRates[speed];
      utterance.onstart = () => {
        if (id === this.generation) this.state(true);
      };
      utterance.onend = () => {
        if (id === this.generation) this.state(false);
      };
      utterance.onerror = () => {
        if (id === this.generation) {
          this.state(false);
          this.notice(
            "Could not play speech. Check your media volume or tap Listen again.",
          );
        }
      };
      window.speechSynthesis.speak(utterance);
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
      )
        throw new Error("tts_unavailable");
      const blob = await response.blob();
      if (id !== this.generation) return;
      if (!blob.size) throw new Error("empty_audio");
      this.url = URL.createObjectURL(blob);
      const audio = new Audio(this.url);
      this.audio = audio;
      audio.playbackRate = voiceRates[speed];
      let failed = false;
      const fail = () => {
        if (failed || id !== this.generation) return;
        failed = true;
        audio.pause();
        this.state(false);
        fallback();
      };
      audio.onerror = fail;
      audio.onended = () => {
        if (id === this.generation) {
          this.state(false);
          if (this.url) URL.revokeObjectURL(this.url);
          this.url = undefined;
        }
      };
      await audio.play();
      if (id === this.generation && !failed) this.state(true);
    } catch {
      if (id === this.generation && !request.signal.aborted) fallback();
    }
  }
}
