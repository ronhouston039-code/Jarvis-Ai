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
test("cleanup from an older capture cannot release a newer microphone", async () => {
  const f = setup(),
    meter = new FocusAudioMeter();
  await meter.startMicrophone();
  const oldRevision = meter.microphoneRevision();
  await meter.startMicrophone();
  f.track.stop.mockClear();
  meter.stopMicrophone(oldRevision);
  expect(f.track.stop).not.toHaveBeenCalled();
  expect(meter.level("listening")).toBe(1);
  meter.close();
  expect(f.track.stop).toHaveBeenCalledOnce();
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
  expect(meter.bands("speaking").available).toBe(true);
  f.analyser.getByteFrequencyData = (data) => data.fill(0);
  expect(meter.bands("speaking")).toMatchObject({ available: true, level: 0 });
  meter.attachSpeech(null);
  expect(meter.level("speaking")).toBe(0);
  expect(meter.bands("speaking").available).toBe(false);
  meter.close();
});
test("frequency bands distinguish low bass from high-frequency audio", async () => {
  const f = setup(),
    meter = new FocusAudioMeter();
  await meter.startMicrophone();
  f.analyser.getByteFrequencyData = (data) => {
    data.fill(0);
    data[1] = 255;
    return data;
  };
  const bass = meter.bands("listening");
  expect(bass.bass).toBeGreaterThan(0);
  expect(bass.high).toBe(0);
  expect(bass.mid).toBe(0);
  f.analyser.getByteFrequencyData = (data) => {
    data.fill(0);
    data[30] = 255;
    return data;
  };
  const high = meter.bands("listening");
  expect(high.bass).toBe(0);
  expect(high.high).toBeGreaterThan(0);
  expect(high.mid).toBe(0);
  meter.close();
});

test("partial speech analysis failure restores direct playback and releases it on stop", async () => {
  const f = setup(),
    meter = new FocusAudioMeter();
  await meter.enable();
  f.analyser.connect.mockImplementation(() => {
    throw new Error("analysis_graph_unavailable");
  });
  const audio = {} as HTMLAudioElement;
  expect(() => meter.attachSpeech(audio)).not.toThrow();
  expect(f.output.connect).toHaveBeenNthCalledWith(1, f.analyser);
  expect(f.output.connect).toHaveBeenNthCalledWith(2, f.context.destination);
  expect(f.output.disconnect).toHaveBeenCalledOnce();
  expect(f.analyser.disconnect).toHaveBeenCalledOnce();
  expect(meter.level("speaking")).toBe(0);
  // The restored direct route is retained, avoiding duplicate source creation.
  meter.attachSpeech(audio);
  expect(f.output.connect).toHaveBeenCalledTimes(2);
  meter.attachSpeech(null);
  expect(f.output.disconnect).toHaveBeenCalledTimes(2);
  meter.close();
  expect(f.context.close).toHaveBeenCalledOnce();
});
