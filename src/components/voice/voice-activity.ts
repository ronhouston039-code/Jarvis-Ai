export type VoiceBands = {
  level: number;
  bass: number;
  mid: number;
  high: number;
};
export type VoiceActivityEvent = "speech-ended" | "barge-in" | null;

/** Local energy VAD. Echo cancellation remains the capture device's responsibility. */
export class VoiceActivityDetector {
  private startedAt: number;
  private loudSince: number | null = null;
  private lastVoiceAt: number | null = null;
  private baseline = 0;
  private finished = false;
  constructor(
    private mode: "listening" | "speaking",
    now: number,
  ) {
    this.startedAt = now;
  }
  sample(
    now: number,
    microphone: VoiceBands,
    output: VoiceBands,
  ): VoiceActivityEvent {
    if (this.finished) return null;
    const level = Math.max(0, Math.min(1, microphone.level));
    const voiceEnergy = microphone.mid + microphone.high;
    if (this.mode === "listening") {
      if (level > 0.055 && voiceEnergy > 0.08) this.lastVoiceAt = now;
      if (this.lastVoiceAt !== null && now - this.lastVoiceAt >= 950) {
        this.finished = true;
        return "speech-ended";
      }
      return null;
    }
    // Learn the room/noise floor during initial playback and ignore its onset.
    // For device TTS there is no output buffer, so use a longer guard and floor.
    const measuredOutput = output.level > 0.01;
    const warmup = measuredOutput ? 450 : 700;
    if (now - this.startedAt < warmup) {
      this.baseline = this.baseline * 0.92 + level * 0.08;
      return null;
    }
    const threshold = Math.max(
      measuredOutput ? 0.12 : 0.18,
      this.baseline * 1.6 + 0.06,
      output.level * 0.6 + 0.06,
    );
    const userVoice = level > threshold && voiceEnergy > 0.14;
    if (!userVoice) {
      this.loudSince = null;
      this.baseline = this.baseline * 0.99 + level * 0.01;
      return null;
    }
    this.loudSince ??= now;
    if (now - this.loudSince >= 220) {
      this.finished = true;
      return "barge-in";
    }
    return null;
  }
}

/** Match a leading activation phrase, never a name embedded in unrelated speech. */
export function wakeRequest(transcript: string): string | null {
  const match = transcript
    .trim()
    .match(/^(?:hey\s+)?jarvis\b[\s,:.!?—-]*(.*)$/i);
  return match ? match[1].trim() : null;
}
