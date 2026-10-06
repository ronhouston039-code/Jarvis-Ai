import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DeviceSpeechController } from "./device-speech";

class MockUtterance {
  lang = "";
  volume = 1;
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

const controllers: DeviceSpeechController[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(lateVoices = false) {
  const voice = { name: "Samantha", lang: "en-US" } as SpeechSynthesisVoice;
  let voices: SpeechSynthesisVoice[] = lateVoices ? [] : [voice];
  const document = Object.assign(new EventTarget(), { hidden: false });
  const calls: MockUtterance[] = [];
  const queue: MockUtterance[] = [];
  const order: string[] = [];
  const synthesis = Object.assign(new EventTarget(), {
    getVoices: vi.fn(() => voices),
    speak: vi.fn((utterance: MockUtterance) => {
      order.push(utterance.volume === 0 ? "prime" : "speak");
      calls.push(utterance);
      queue.push(utterance);
    }),
    resume: vi.fn(),
    cancel: vi.fn(() => {
      order.push("cancel");
      queue.length = 0;
    }),
  });
  const window = Object.assign(new EventTarget(), {
    speechSynthesis: synthesis,
  });
  const navigator = {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    maxTouchPoints: 1,
    userActivation: { isActive: true },
  };
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  vi.stubGlobal("navigator", navigator);
  vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
  const callbacks = {
    onSpeaking: vi.fn(),
    onPhase: vi.fn(),
    onError: vi.fn(),
    onBackground: vi.fn(),
  };
  const controller = new DeviceSpeechController(callbacks);
  controllers.push(controller);
  const resume = vi.fn(() => {
    order.push("unlock");
    return Promise.resolve();
  });
  const audible = () => calls.filter((utterance) => utterance.volume > 0);
  const loadVoices = () => {
    voices = [voice];
    synthesis.dispatchEvent(new Event("voiceschanged"));
  };
  return {
    controller,
    callbacks,
    synthesis,
    window,
    document,
    navigator,
    calls,
    queue,
    order,
    voice,
    resume,
    audible,
    loadVoices,
    setVoices: (available: SpeechSynthesisVoice[]) => { voices = available; },
  };
}

test("gesture unlock and muted preparation happen synchronously before device speech", () => {
  const f = setup();
  const resume = vi.fn(() => {
    f.order.push("unlock");
    return new Promise<void>(() => {});
  });
  expect(f.controller.primeFromGesture(resume)).toBe(true);
  expect(f.order).toEqual(["unlock", "cancel", "prime"]);
  expect(f.calls[0]).toMatchObject({ text: " ", volume: 0, lang: "en-US" });
  expect(f.callbacks.onSpeaking).not.toHaveBeenCalledWith(true);
  expect(f.callbacks.onPhase).not.toHaveBeenCalledWith("started");
  f.controller.speak("Device voice is working.");
  expect(f.audible()[0]).toMatchObject({
    lang: "en-US",
    volume: 1,
    rate: 1,
    pitch: 1,
    voice: f.voice,
  });
  expect(f.queue).toHaveLength(1);
  expect(f.callbacks.onSpeaking).not.toHaveBeenCalledWith(true);
  const utterance = f.audible()[0];
  utterance.onstart?.();
  expect(f.callbacks.onSpeaking).toHaveBeenLastCalledWith(true);
  expect(f.callbacks.onPhase).toHaveBeenLastCalledWith("started");
  utterance.onend?.();
  expect(f.callbacks.onSpeaking).toHaveBeenLastCalledWith(false);
  expect(f.callbacks.onPhase).toHaveBeenLastCalledWith("completed");
});

test("late voiceschanged selects an actual available voice and dispatches only once", () => {
  const f = setup(true);
  f.controller.primeFromGesture(f.resume);
  f.controller.speak("Late voice.");
  expect(f.audible()).toHaveLength(0);
  vi.advanceTimersByTime(1000);
  expect(f.audible()).toHaveLength(0);
  f.loadVoices();
  expect(f.audible()).toHaveLength(1);
  expect(f.audible()[0].voice).toBe(f.voice);
  f.loadVoices();
  vi.advanceTimersByTime(600);
  expect(f.audible()).toHaveLength(1);
});

test("voice wait is bounded and browser default is used without fabricating a voice", () => {
  const f = setup(true);
  f.controller.primeFromGesture(f.resume);
  f.controller.speak("Default voice.", 9);
  vi.advanceTimersByTime(1499);
  expect(f.audible()).toHaveLength(0);
  vi.advanceTimersByTime(1);
  expect(f.audible()[0]).toMatchObject({
    voice: null,
    rate: 1,
    pitch: 1,
    volume: 1,
  });
  expect(f.callbacks.onError).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1999);
  expect(f.callbacks.onError).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(f.callbacks.onPhase).toHaveBeenLastCalledWith("blocked");
  expect(f.callbacks.onError).toHaveBeenCalledWith("start-timeout");
  expect(f.callbacks.onSpeaking).not.toHaveBeenCalledWith(true);
});

test.each([
  "synthesis-failed",
  "audio-hardware",
  "network",
  "not-allowed",
  "private diagnostic token",
])("speech errors keep only the safe category: %s", (error) => {
  const f = setup();
  f.controller.primeFromGesture(f.resume);
  f.controller.speak("Private reply.");
  f.audible()[0].onerror?.({ error });
  const category =
    error === "private diagnostic token" ? "browser-error" : error;
  expect(f.callbacks.onError).toHaveBeenCalledWith(category);
  expect(f.callbacks.onPhase).toHaveBeenLastCalledWith(
    error === "not-allowed" ? "blocked" : "browser-error",
  );
  expect(f.queue).toHaveLength(0);
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
    "Private reply.",
  );
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
    "private diagnostic token",
  );
});

test("ending before onstart cannot report completed speech", () => {
  const f = setup();
  f.controller.primeFromGesture(f.resume);
  f.controller.speak("Never started.");
  f.audible()[0].onend?.();
  expect(f.callbacks.onPhase).toHaveBeenLastCalledWith("blocked");
  expect(f.callbacks.onPhase).not.toHaveBeenCalledWith("completed");
});

test("no-start watchdog clears state and ignores late browser callbacks", () => {
  const f = setup();
  f.controller.primeFromGesture(f.resume);
  f.controller.speak("Blocked speech.");
  const start = f.audible()[0].onstart;
  vi.advanceTimersByTime(2000);
  expect(f.callbacks.onError).toHaveBeenLastCalledWith("start-timeout");
  start?.();
  expect(f.callbacks.onSpeaking).not.toHaveBeenCalledWith(true);
  expect(f.callbacks.onPhase).toHaveBeenLastCalledWith("blocked");
});

test.each(["visibilitychange", "pagehide"])(
  "%s cancels speech and returning requires a new gesture",
  (event) => {
    const f = setup();
    f.controller.primeFromGesture(f.resume);
    f.controller.speak("Before background.");
    const utterance = f.audible()[0];
    const staleEnd = utterance.onend;
    utterance.onstart?.();
    if (event === "visibilitychange") {
      f.document.hidden = true;
      f.document.dispatchEvent(new Event(event));
    } else f.window.dispatchEvent(new Event(event));
    expect(f.callbacks.onSpeaking).toHaveBeenLastCalledWith(false);
    expect(f.queue).toHaveLength(0);
    expect(f.callbacks.onBackground).toHaveBeenCalledOnce();
    f.document.hidden = false;
    f.document.dispatchEvent(new Event("visibilitychange"));
    staleEnd?.();
    expect(f.callbacks.onPhase).not.toHaveBeenCalledWith("completed");
    expect(f.audible()).toHaveLength(1);
    f.controller.speak("No automatic restart.");
    expect(f.callbacks.onError).toHaveBeenLastCalledWith("not-allowed");
    expect(f.audible()).toHaveLength(1);
    f.controller.primeFromGesture(f.resume);
    f.controller.speak("Fresh tap.");
    expect(f.audible()).toHaveLength(2);
  },
);

test("a hidden or inactive gesture cannot unlock device speech", () => {
  const f = setup();
  f.navigator.userActivation.isActive = false;
  expect(f.controller.primeFromGesture(f.resume)).toBe(false);
  expect(f.resume).not.toHaveBeenCalled();
  f.controller.speak("Blocked.");
  expect(f.audible()).toHaveLength(0);
  expect(f.callbacks.onPhase).toHaveBeenLastCalledWith("blocked");
  f.navigator.userActivation.isActive = true;
  f.document.hidden = true;
  expect(f.controller.primeFromGesture(f.resume)).toBe(false);
  expect(f.resume).not.toHaveBeenCalled();
});

test("rapid speech interruptions create fresh utterances without duplicate queues", () => {
  const f = setup();
  f.controller.primeFromGesture(f.resume);
  for (let i = 0; i < 5; i++) {
    f.controller.speak(`Turn ${i}.`);
    const utterance = f.audible().at(-1)!;
    const oldStart = utterance.onstart;
    const oldEnd = utterance.onend;
    utterance.onstart?.();
    f.controller.cancel();
    f.callbacks.onSpeaking.mockClear();
    oldStart?.();
    oldEnd?.();
    expect(f.callbacks.onSpeaking).not.toHaveBeenCalledWith(true);
    expect(f.queue).toHaveLength(0);
  }
  expect(new Set(f.audible()).size).toBe(5);
  expect(f.callbacks.onPhase).not.toHaveBeenCalledWith("completed");
  expect(vi.getTimerCount()).toBe(0);
});

test("cancelling pending voice loading cannot enqueue an older turn", () => {
  const f = setup(true);
  f.controller.primeFromGesture(f.resume);
  f.controller.speak("Old turn.");
  f.controller.speak("New turn.");
  f.loadVoices();
  expect(f.audible().map((utterance) => utterance.text)).toEqual(["New turn."]);
  f.controller.dispose();
  f.loadVoices();
  vi.runAllTimers();
  expect(f.queue).toHaveLength(0);
  expect(f.audible()).toHaveLength(1);
});

test("a synchronous browser throw is reported safely and clears the queue", () => {
  const f = setup();
  f.controller.primeFromGesture(f.resume);
  f.synthesis.speak.mockImplementation(() => {
    throw new Error("private browser token");
  });
  f.controller.speak("Private text.");
  expect(f.callbacks.onError).toHaveBeenLastCalledWith("browser-error");
  expect(f.callbacks.onSpeaking).not.toHaveBeenCalledWith(true);
  expect(vi.getTimerCount()).toBe(0);
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
    "private browser token",
  );
});

test("non-English voices leave Safari's default selected and device rates stay safe", () => {
  const f = setup();
  f.setVoices([{ name: "French voice", lang: "fr-FR" } as SpeechSynthesisVoice]);
  f.controller.primeFromGesture(f.resume);
  f.controller.speak("English reply.", 0.1);
  expect(f.audible()[0]).toMatchObject({ voice: null, lang: "en-US", rate: 0.95 });
});

test("intentional cancellation is set before synchronous cancel errors and clears timers", () => {
  const f = setup();
  f.controller.primeFromGesture(f.resume);
  f.controller.speak("Cancel this reply.");
  const staleError = f.audible()[0].onerror;
  f.synthesis.cancel.mockImplementation(() => {
    staleError?.({ error: "synthesis-failed" });
    f.queue.length = 0;
  });
  f.controller.cancel("stop");
  expect(f.callbacks.onError).not.toHaveBeenCalled();
  expect(f.callbacks.onPhase).toHaveBeenLastCalledWith("cancelled");
  expect(vi.getTimerCount()).toBe(0);
  f.controller.speak("A real later error.");
  f.audible().at(-1)?.onerror?.({ error: "synthesis-failed" });
  expect(f.callbacks.onError).toHaveBeenCalledExactlyOnceWith("synthesis-failed");
});
