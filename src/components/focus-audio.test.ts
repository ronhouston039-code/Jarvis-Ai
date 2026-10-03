import { afterEach, expect, test, vi } from "vitest";
import { FocusAudioMeter } from "./focus-audio";
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const mic = node(),
    output = node();
  const analyser = {
    ...node(),
    getByteFrequencyData: (data: Uint8Array) => data.fill(160),
  };
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const context = {
    state: "running",
    destination: {},
    resume: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    createAnalyser: () => analyser,
    createMediaStreamSource: () => mic,
    createMediaElementSource: () => output,
  };
  vi.stubGlobal("window", {
    AudioContext: class {
      constructor() {
        return context;
      }
    },
  });
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  return { mic, output, analyser, track, stream, context, getUserMedia };
}
test("microphone is analysed locally without speaker feedback and released on stop", async () => {
  const f = setup(),
    meter = new FocusAudioMeter();
  expect(await meter.startMicrophone()).toBe(true);
  expect(f.mic.connect).toHaveBeenCalledWith(f.analyser);
  expect(f.analyser.connect).not.toHaveBeenCalled();
  expect(meter.level("listening")).toBe(1);
  expect(meter.level("speaking")).toBe(0);
  meter.close();
  expect(f.track.stop).toHaveBeenCalledOnce();
  expect(f.context.close).toHaveBeenCalledOnce();
  expect(meter.level("listening")).toBe(0);
});
test("late microphone permission cannot restart listening after exit", async () => {
  const f = setup(),
    meter = new FocusAudioMeter();
  let resolve!: (stream: unknown) => void;
  f.getUserMedia.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = meter.startMicrophone();
  await vi.waitFor(() => expect(f.getUserMedia).toHaveBeenCalled());
  meter.close();
  resolve(f.stream);
  expect(await pending).toBe(false);
  expect(f.track.stop).toHaveBeenCalledOnce();
  expect(f.mic.connect).not.toHaveBeenCalled();
});
test("speech output passes through analyser to speakers without duplicate source creation", async () => {
  const f = setup(),
    meter = new FocusAudioMeter();
  await meter.enable();
  const audio = {} as HTMLAudioElement;
  meter.attachSpeech(audio);
  meter.attachSpeech(audio);
  expect(f.output.connect).toHaveBeenCalledOnce();
  expect(f.analyser.connect).toHaveBeenCalledWith(f.context.destination);
  expect(meter.level("speaking")).toBe(1);
  meter.attachSpeech(null);
  expect(meter.level("speaking")).toBe(0);
  meter.close();
});
