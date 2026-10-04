import { expect, test } from "vitest";
import { VoiceActivityDetector, wakeRequest } from "./voice-activity";
const quiet = { level: 0.01, bass: 0, mid: 0.02, high: 0 };
const voice = { level: 0.65, bass: 0.2, mid: 0.8, high: 0.1 };
test("a heard voice ends after sustained silence, never before voice is heard", () => {
  const vad = new VoiceActivityDetector("listening", 0);
  expect(vad.sample(2000, quiet, quiet)).toBeNull();
  expect(vad.sample(2500, voice, quiet)).toBeNull();
  expect(vad.sample(3300, quiet, quiet)).toBeNull();
  expect(vad.sample(3460, quiet, quiet)).toBe("speech-ended");
  expect(vad.sample(5000, quiet, quiet)).toBeNull();
});
test("playback onset, output echo and short sounds do not cause barge-in", () => {
  const vad = new VoiceActivityDetector("speaking", 0);
  const output = { ...voice, level: 0.7 };
  expect(vad.sample(100, voice, output)).toBeNull();
  for (let time = 450; time <= 2000; time += 30)
    expect(vad.sample(time, { ...voice, level: 0.22 }, output)).toBeNull();
  expect(vad.sample(2200, voice, output)).toBeNull();
  expect(vad.sample(2290, quiet, output)).toBeNull();
  expect(vad.sample(2400, voice, output)).toBeNull();
  expect(vad.sample(2630, voice, output)).toBe("barge-in");
});
test("device speech uses a longer warmup and can still be interrupted", () => {
  const vad = new VoiceActivityDetector("speaking", 0);
  expect(vad.sample(450, quiet, quiet)).toBeNull();
  expect(vad.sample(720, voice, quiet)).toBeNull();
  expect(vad.sample(950, voice, quiet)).toBe("barge-in");
});
test("wake matching requires a leading phrase and preserves the exact command", () => {
  expect(wakeRequest("Hey Jarvis, turn off my TV.")).toBe("turn off my TV.");
  expect(wakeRequest("JARVIS")).toBe("");
  expect(wakeRequest("tell me about Jarvis")).toBeNull();
  expect(wakeRequest("Jarvison play music")).toBeNull();
});
