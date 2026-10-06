import { openHomeMenu, mockHomeMapTiles } from "./helpers/home-controls";
import { expect, loadAllTestAccounts, test } from "deepspace/testing";
import type { Page } from "@playwright/test";

test.skip(loadAllTestAccounts().length < 1, "Requires test account");

const TEST_PHRASE = "Device voice is working.";
const FAILURE_INSTRUCTION =
  "Device voice could not start. Tap Test Device Voice and check your audio output.";

type DeviceVoiceCall = {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  voiceName: string | null;
};
type DeviceVoiceBoundary = {
  events: string[];
  utterances: SpeechSynthesisUtterance[];
  calls: DeviceVoiceCall[];
  active: SpeechSynthesisUtterance[];
  maxQueued: number;
  cancels: number;
  starts: number;
  streams: MediaStream[];
  requests: string[];
  recognition: { onresult: (event: unknown) => void };
  loadVoices: () => void;
  emit: (type: "start" | "end" | "error", error?: string) => void;
};

/** iOS speech/media boundaries; the app controls all speech and UI state. */
async function installDeviceVoice(page: Page, lateVoices = false) {
  await mockHomeMapTiles(page);
  await page.addInitScript(
    ({ lateVoices }) => {
      Object.defineProperty(navigator, "userAgent", {
        get: () =>
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      });
      Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
      Object.defineProperty(navigator, "language", { get: () => "en-US" });
      const state = {
        events: [],
        utterances: [],
        calls: [],
        active: [],
        maxQueued: 0,
        cancels: 0,
        starts: 0,
        streams: [],
        requests: [],
      } as unknown as DeviceVoiceBoundary;
      (window as unknown as { deviceVoice: DeviceVoiceBoundary }).deviceVoice =
        state;
      class Utterance extends EventTarget {
        text: string;
        lang = "";
        rate = 1;
        pitch = 1;
        volume = 1;
        voice: SpeechSynthesisVoice | null = null;
        onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
        onend: ((event: SpeechSynthesisEvent) => void) | null = null;
        onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
        constructor(text = "") {
          super();
          this.text = text;
        }
      }
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: Utterance,
      });
      const voice = {
        name: "Samantha",
        lang: "en-US",
        voiceURI: "com.apple.voice.compact.en-US.Samantha",
        default: true,
        localService: true,
      } as SpeechSynthesisVoice;
      let voices = lateVoices ? [] : [voice];
      const synthesis = Object.assign(new EventTarget(), {
        onvoiceschanged: null as (() => void) | null,
        getVoices: () => voices,
        get speaking() {
          return state.active.length > 0;
        },
        get pending() {
          return state.active.length > 1;
        },
        cancel() {
          state.events.push("cancel");
          state.cancels++;
          state.active = [];
        },
        speak(utterance: SpeechSynthesisUtterance) {
          const audible = utterance.volume > 0 && !!utterance.text.trim();
          state.events.push(audible ? "speak-audible" : "speak-prime");
          state.utterances.push(utterance);
          state.calls.push({
            text: utterance.text,
            lang: utterance.lang,
            rate: utterance.rate,
            pitch: utterance.pitch,
            volume: utterance.volume,
            voiceName: utterance.voice?.name ?? null,
          });
          if (audible) {
            state.active.push(utterance);
            state.maxQueued = Math.max(state.maxQueued, state.active.length);
          }
          // Queuing speech deliberately emits no success event.
        },
      });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: synthesis,
      });
      state.loadVoices = () => {
        voices = [voice];
        synthesis.dispatchEvent(new Event("voiceschanged"));
        synthesis.onvoiceschanged?.();
      };
      state.emit = (type, error = "synthesis-failed") => {
        const utterance = state.utterances.findLast(
          (item) => item.volume > 0 && !!item.text.trim(),
        );
        if (!utterance) throw new Error("No audible utterance was queued");
        const event = Object.assign(new Event(type), {
          utterance,
          error,
          charIndex: 0,
          charLength: 0,
          elapsedTime: 0,
          name: "",
        });
        if (type === "start")
          utterance.onstart?.(event as SpeechSynthesisEvent);
        else if (type === "end") {
          state.active = state.active.filter((item) => item !== utterance);
          utterance.onend?.(event as SpeechSynthesisEvent);
        } else {
          state.active = state.active.filter((item) => item !== utterance);
          utterance.onerror?.(event as SpeechSynthesisErrorEvent);
        }
        utterance.dispatchEvent(event);
      };
      const NativeAudioContext = window.AudioContext;
      class LoggedAudioContext extends NativeAudioContext {
        resume() {
          state.events.push("context-resume");
          return super.resume();
        }
      }
      Object.defineProperty(window, "AudioContext", {
        configurable: true,
        value: LoggedAudioContext,
      });
      Object.defineProperty(window, "webkitAudioContext", {
        configurable: true,
        value: LoggedAudioContext,
      });
      class Recognition {
        onresult!: (event: unknown) => void;
        onend?: () => void;
        start() {
          state.events.push("recognition-start");
          state.recognition = this;
          state.starts++;
        }
        stop() {
          this.onend?.();
        }
      }
      for (const key of ["SpeechRecognition", "webkitSpeechRecognition"])
        Object.defineProperty(window, key, {
          configurable: true,
          value: Recognition,
        });
      navigator.mediaDevices.getUserMedia = async () => {
        state.events.push("get-user-media");
        const context = new NativeAudioContext();
        await context.resume();
        const stream = context.createMediaStreamDestination().stream;
        state.streams.push(stream);
        const track = stream.getTracks()[0];
        const stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          void context.close();
        };
        return stream;
      };
      const fetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const path =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.pathname
              : input.url;
        if (path.includes("/api/tts") || path.includes("/voice/greeting")) {
          state.events.push("tts-request");
          state.requests.push(path);
        }
        return fetch(input, init);
      };
    },
    { lateVoices },
  );
  await page.route("**/api/jarvis/capabilities", (route) =>
    route.fulfill({ json: { fishVoice: false } }),
  );
  for (const path of ["**/api/tts", "**/api/jarvis/voice/greeting"])
    await page.route(path, (route) =>
      route.fulfill({
        status: 503,
        json: { error: "voice_unavailable", reason: "provider_unavailable" },
      }),
    );
}

async function calls(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as { deviceVoice: DeviceVoiceBoundary }
    ).deviceVoice.calls.filter((call) => call.volume > 0 && !!call.text.trim()),
  );
}

async function emit(page: Page, type: "start" | "end" | "error") {
  await page.evaluate(
    (event) =>
      (
        window as unknown as { deviceVoice: DeviceVoiceBoundary }
      ).deviceVoice.emit(event),
    type,
  );
}

function testStatus(page: Page) {
  return page.getByRole("status", {
    name: "Device voice test status",
    exact: true,
  });
}

function testButton(page: Page) {
  return page.getByRole("button", { name: "Test Device Voice", exact: true });
}

test("device voice direct Settings tap unlocks silently and reports only actual speech events", async ({
  users,
}) => {
  const [user] = await users(1);
  const page = user.page;
  await installDeviceVoice(page);
  await page.goto("/settings");
  expect(await calls(page)).toEqual([]);
  await testButton(page).click();
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  expect(await calls(page)).toEqual([
    {
      text: TEST_PHRASE,
      lang: "en-US",
      voiceName: "Samantha",
      volume: 1,
      rate: 1,
      pitch: 1,
    },
  ]);
  await expect(testStatus(page)).not.toHaveText("Device voice started.");
  const boundary = await page.evaluate(() => {
    const state = (window as unknown as { deviceVoice: DeviceVoiceBoundary })
      .deviceVoice;
    return {
      events: state.events,
      calls: state.calls,
      requests: state.requests,
    };
  });
  const prime = boundary.calls.filter((call) => !call.text.trim());
  expect(prime.length).toBeGreaterThan(0);
  expect(prime.every((call) => call.volume === 0)).toBe(true);
  expect(boundary.events.indexOf("context-resume")).toBeGreaterThanOrEqual(0);
  expect(boundary.events.indexOf("context-resume")).toBeLessThan(
    boundary.events.indexOf("speak-prime"),
  );
  expect(boundary.requests).toEqual([]);
  await emit(page, "start");
  await expect(testStatus(page)).toHaveText("Device voice started.");
  await emit(page, "end");
  await expect(testStatus(page)).toHaveText("Device voice completed.");
});

test("device voice waits for late iPhone voiceschanged and selects a valid matching voice", async ({
  users,
}) => {
  const [user] = await users(1);
  const page = user.page;
  await installDeviceVoice(page, true);
  await page.goto("/settings");
  await testButton(page).click();
  expect(await calls(page)).toEqual([]);
  await expect(testStatus(page)).not.toHaveText("Device voice started.");
  await page.evaluate(() =>
    (
      window as unknown as { deviceVoice: DeviceVoiceBoundary }
    ).deviceVoice.loadVoices(),
  );
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  expect((await calls(page))[0]).toMatchObject({
    text: TEST_PHRASE,
    lang: "en-US",
    voiceName: "Samantha",
    volume: 1,
  });
  await emit(page, "start");
  await expect(testStatus(page)).toHaveText("Device voice started.");
  await emit(page, "end");
  await expect(testStatus(page)).toHaveText("Device voice completed.");
});

test("device voice Fish fallback keeps safe provider diagnostics separate from actual device events", async ({
  users,
}) => {
  const [user] = await users(1);
  const page = user.page;
  await installDeviceVoice(page);
  await page.unroute("**/api/tts");
  await page.route("**/api/tts", (route) =>
    route.fulfill({
      status: 402,
      json: {
        provider: "fish_audio",
        category: "credits-required",
        providerStatus: 402,
      },
    }),
  );
  await page.goto("/settings");
  await page.getByRole("button", { name: "Test voice", exact: true }).click();
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await expect(
    page.getByRole("status", {
      name: "Fish Audio failure status",
      exact: true,
    }),
  ).toHaveText("Fish Audio 402: credits or plan issue.");
  await expect(
    page.getByText("Fish Audio unavailable — using device voice.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Jarvis is speaking…", { exact: true }),
  ).toHaveCount(0);
  await emit(page, "start");
  await expect(
    page.getByText("Jarvis is speaking…", { exact: true }),
  ).toBeVisible();
  await emit(page, "end");
  await expect(
    page.getByText("Jarvis is speaking…", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { deviceVoice: DeviceVoiceBoundary }).deviceVoice
          .requests.length,
    ),
  ).toBe(1);
});

test("device voice exposes browser errors and the no-start watchdog without claiming success", async ({
  users,
}) => {
  const [user] = await users(1);
  const page = user.page;
  await installDeviceVoice(page);
  await page.goto("/settings");
  await page.clock.install();
  await testButton(page).click();
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await emit(page, "error");
  await expect(testStatus(page)).toHaveText("Device voice browser error.");
  await expect(
    page.getByText(FAILURE_INSTRUCTION, { exact: true }),
  ).toBeVisible();
  await testButton(page).click();
  await expect.poll(async () => (await calls(page)).length).toBe(2);
  await expect(testStatus(page)).not.toHaveText("Device voice started.");
  await page.clock.fastForward(2100);
  await expect(testStatus(page)).toHaveText("Device voice blocked.");
  await expect(
    page.getByText(FAILURE_INSTRUCTION, { exact: true }),
  ).toBeVisible();
  const count = (await calls(page)).length;
  await page.clock.fastForward(5000);
  expect((await calls(page)).length).toBe(count);
  await expect(testStatus(page)).not.toHaveText("Device voice completed.");
});

test("device voice cancels on hidden and pagehide and stays stopped after foregrounding", async ({
  users,
}) => {
  const [user] = await users(1);
  const page = user.page;
  await installDeviceVoice(page);
  await page.goto("/settings");
  await testButton(page).click();
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await emit(page, "start");
  await expect(testStatus(page)).toHaveText("Device voice started.");
  const cancels = await page.evaluate(
    () =>
      (window as unknown as { deviceVoice: DeviceVoiceBoundary }).deviceVoice
        .cancels,
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { deviceVoice: DeviceVoiceBoundary }).deviceVoice
          .cancels,
    ),
  ).toBeGreaterThan(cancels);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { deviceVoice: DeviceVoiceBoundary }).deviceVoice
          .active.length,
    ),
  ).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(150);
  expect((await calls(page)).length).toBe(1);
  // Browser callbacks arriving after cancellation must not report completion.
  await emit(page, "end");
  await expect(testStatus(page)).not.toHaveText("Device voice completed.");
  await testButton(page).click();
  await expect.poll(async () => (await calls(page)).length).toBe(2);
  await emit(page, "start");
  const pagehideCancels = await page.evaluate(
    () =>
      (window as unknown as { deviceVoice: DeviceVoiceBoundary }).deviceVoice
        .cancels,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { deviceVoice: DeviceVoiceBoundary }).deviceVoice
          .cancels,
    ),
  ).toBeGreaterThan(pagehideCancels);
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await page.waitForTimeout(150);
  expect((await calls(page)).length).toBe(2);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { deviceVoice: DeviceVoiceBoundary }).deviceVoice
          .active.length,
    ),
  ).toBe(0);
});

test("device voice repeated Talk turns unlock before capture and cancel previous speech instead of queuing", async ({
  users,
}) => {
  const [user] = await users(1);
  const page = user.page;
  await installDeviceVoice(page);
  await page.goto("/home");
  const talk = page.getByRole("button", { name: "Talk mode", exact: true });
  await openHomeMenu(page);
  await talk.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { deviceVoice: DeviceVoiceBoundary })
            .deviceVoice.starts,
      ),
    )
    .toBe(1);
  const initial = await page.evaluate(
    () =>
      (window as unknown as { deviceVoice: DeviceVoiceBoundary }).deviceVoice
        .events,
  );
  expect(initial.indexOf("context-resume")).toBeGreaterThanOrEqual(0);
  expect(initial.indexOf("context-resume")).toBeLessThan(
    initial.indexOf("get-user-media"),
  );
  expect(initial.indexOf("speak-prime")).toBeGreaterThanOrEqual(0);
  expect(initial.indexOf("speak-prime")).toBeLessThan(
    initial.indexOf("get-user-media"),
  );
  for (let turn = 1; turn <= 2; turn++) {
    await page.evaluate(() => {
      (
        window as unknown as { deviceVoice: DeviceVoiceBoundary }
      ).deviceVoice.recognition.onresult({
        results: [
          Object.assign([{ transcript: "repeat greeting" }], { isFinal: true }),
        ],
      });
    });
    await expect.poll(async () => (await calls(page)).length).toBe(turn);
    await expect(page.locator(".hologram-live-status")).toContainText(
      "Fish Audio unavailable — using device voice.",
    );
    await emit(page, "start");
    if (turn === 1) {
      await page
        .getByRole("button", { name: "Start voice input", exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as { deviceVoice: DeviceVoiceBoundary })
                .deviceVoice.starts,
          ),
        )
        .toBe(2);
    }
  }
  const boundary = await page.evaluate(() => {
    const state = (window as unknown as { deviceVoice: DeviceVoiceBoundary })
      .deviceVoice;
    return {
      events: state.events,
      maxQueued: state.maxQueued,
      calls: state.calls,
    };
  });
  expect(boundary.maxQueued).toBe(1);
  for (let index = 0; index < boundary.events.length; index++) {
    if (!boundary.events[index].startsWith("speak-")) continue;
    expect(boundary.events[index - 1]).toBe("cancel");
  }
  expect(
    boundary.calls
      .filter((call) => !call.text.trim())
      .every((call) => call.volume === 0),
  ).toBe(true);
  await openHomeMenu(page);
  await talk.click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { deviceVoice: DeviceVoiceBoundary }).deviceVoice
          .active.length,
    ),
  ).toBe(0);
});

test("device voice Talk resume rejection shows blocked state without starting recognition", async ({ users }) => {
  const [user] = await users(1);
  const page = user.page;
  await installDeviceVoice(page);
  await page.addInitScript(() => {
    window.AudioContext.prototype.resume = () =>
      Promise.reject(new DOMException("private audio diagnostics", "NotAllowedError"));
  });
  await page.goto("/home");
  await openHomeMenu(page);
  await page.getByRole("button", { name: "Talk mode", exact: true }).click();
  await expect(page.locator(".hologram-live-status")).toContainText(
    "Audio preparation was blocked. Tap Talk Mode and check your audio output.",
  );
  const boundary = await page.evaluate(() => {
    const state = (window as unknown as { deviceVoice: DeviceVoiceBoundary }).deviceVoice;
    return { starts: state.starts, events: state.events, requests: state.requests };
  });
  expect(boundary.starts).toBe(0);
  expect(boundary.events).not.toContain("get-user-media");
  expect(boundary.requests).toEqual([]);
  await openHomeMenu(page);
  await expect(page.getByRole("button", { name: "Talk mode", exact: true })).toHaveAttribute("aria-pressed", "false");
});
