import { expect, loadAllTestAccounts, test } from "deepspace/testing";
import type { Page } from "@playwright/test";
import {
  saveVampConnection,
  SAVED_VAMP_SHORTCUT,
  SAVED_VAMP_URL,
  cleanupVampConnections,
} from "./helpers/vamp-connection";

test.skip(loadAllTestAccounts().length < 1, "Requires test account");
test.afterEach(cleanupVampConnections);

type LiveState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "action-requested"
  | "error-or-fallback";

type VoiceBoundary = {
  starts: number;
  pauses: number;
  cancels: number;
  recognition: { onresult: (event: unknown) => void };
  gain: GainNode;
  streams: MediaStream[];
  audio: HTMLMediaElement;
  utterance: SpeechSynthesisUtterance;
  launches: Array<{ name: string; url: string }>;
  renders: number;
};

/** Only browser/provider boundaries are replaced; state changes use the real UI. */
async function installVoiceBoundaries(page: Page, iPhone = false) {
  await page.addInitScript(
    ({ iPhone }) => {
      const state = {
        starts: 0,
        pauses: 0,
        cancels: 0,
        streams: [] as MediaStream[],
        launches: [] as Array<{ name: string; url: string }>,
        renders: 0,
      } as VoiceBoundary;
      (window as unknown as { globeVoice: VoiceBoundary }).globeVoice = state;
      class Recognition {
        onresult!: (event: unknown) => void;
        onend?: () => void;
        start() {
          state.recognition = this;
          state.starts++;
        }
        stop() {
          this.onend?.();
        }
      }
      Object.defineProperty(window, "SpeechRecognition", {
        configurable: true,
        value: Recognition,
      });
      Object.defineProperty(window, "webkitSpeechRecognition", {
        configurable: true,
        value: Recognition,
      });
      HTMLMediaElement.prototype.play = function () {
        state.audio = this;
        return Promise.resolve();
      };
      const pause = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.pause = function () {
        state.pauses++;
        pause.call(this);
      };
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          cancel() {
            state.cancels++;
          },
          speak(utterance: SpeechSynthesisUtterance) {
            state.utterance = utterance;
            utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
          },
        },
      });
      navigator.mediaDevices.getUserMedia = async () => {
        const context = new AudioContext();
        await context.resume();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const destination = context.createMediaStreamDestination();
        oscillator.frequency.value = 750;
        gain.gain.value = 0;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        state.gain = gain;
        state.streams.push(destination.stream);
        const track = destination.stream.getTracks()[0];
        const stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          oscillator.stop();
          void context.close();
        };
        return destination.stream;
      };
      // Count this globe's actual renders, independently of the main reactor.
      for (const Context of [WebGLRenderingContext, WebGL2RenderingContext]) {
        const clear = Context.prototype.clear;
        Context.prototype.clear = function (mask: number) {
          if (
            this.canvas instanceof HTMLCanvasElement &&
            this.canvas.classList.contains("holographic-globe__canvas")
          )
            state.renders++;
          clear.call(this, mask);
        };
      }
      if (iPhone) {
        Object.defineProperty(navigator, "userAgent", {
          get: () =>
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
        });
        Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
        window.addEventListener("jarvis-music-shortcut-launch", (event) => {
          event.preventDefault();
          state.launches.push((event as CustomEvent).detail);
        });
      }
    },
    { iPhone },
  );
  await page.route("**/api/jarvis/capabilities", (route) =>
    route.fulfill({ json: { fishVoice: false } }),
  );
}

async function utter(page: Page, transcript = "repeat greeting") {
  await page.evaluate((text) => {
    (
      window as unknown as { globeVoice: VoiceBoundary }
    ).globeVoice.recognition.onresult({
      results: [Object.assign([{ transcript: text }], { isFinal: true })],
    });
  }, transcript);
}

async function voiceStarts(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { globeVoice: VoiceBoundary }).globeVoice.starts,
  );
}

function globeCanvas(page: Page) {
  return page.locator('.holographic-globe canvas[data-renderer="webgl"]');
}

async function expectState(page: Page, state: LiveState) {
  await expect(page.locator(".holographic-globe")).toHaveAttribute(
    "data-state",
    state,
  );
  const status = page.locator('.hologram-live-status[role="status"]');
  await expect(status).toBeVisible();
  const captions: Record<LiveState, RegExp> = {
    idle: /idle|ready|awaiting your next request/i,
    listening: /listening/i,
    thinking: /thinking|processing|preparing/i,
    speaking: /speaking/i,
    "action-requested": /action.*requested|request.*dispatched|request.*sent/i,
    "error-or-fallback": /Fish Audio unavailable — using device voice\./,
  };
  await expect(status).toContainText(captions[state]);
  await expect(globeCanvas(page)).toHaveAttribute(
    "data-core-color",
    /^#[\da-f]{6}$/i,
  );
}

async function holdGreeting(page: Page) {
  const { startupAudio } = await import("../src/jarvis/startup-audio");
  let requested = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  page.once("close", release);
  await page.route("**/api/jarvis/voice/greeting", async (route) => {
    requested++;
    await gate;
    if (!page.isClosed())
      await route.fulfill({
        contentType: "audio/mpeg",
        body: Buffer.from(startupAudio, "base64"),
      });
  });
  return { requested: () => requested, release };
}

test("live globe follows listening, thinking, speaking and microphone interruption", async ({
  users,
}) => {
  const [user] = await users(1);
  const page = user.page;
  await installVoiceBoundaries(page);
  const greeting = await holdGreeting(page);
  await page.goto("/home");
  const canvas = globeCanvas(page);
  await expect(canvas).toBeVisible();
  await expectState(page, "idle");
  const rotation = await canvas.getAttribute("data-rotation");
  const talk = page.getByRole("button", { name: "Talk mode", exact: true });
  await talk.click();
  await expect.poll(() => voiceStarts(page)).toBe(1);
  await expectState(page, "listening");
  await expect(canvas).toHaveAttribute("data-audio-source", "measured");
  await page.evaluate(() => {
    (
      window as unknown as { globeVoice: VoiceBoundary }
    ).globeVoice.gain.gain.value = 0.8;
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-level")))
    .toBeGreaterThan(0.01);
  await utter(page);
  await expect.poll(greeting.requested).toBe(1);
  await expectState(page, "thinking");
  greeting.release();
  await expectState(page, "speaking");
  // A valid, silent analyser remains measured; it must not trigger fake energy.
  await expect(canvas).toHaveAttribute("data-audio-source", "measured");
  await expect(canvas).toHaveAttribute("data-level", "0.000");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-scale")))
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { globeVoice: VoiceBoundary }).globeVoice
            .streams.length,
      ),
    )
    .toBe(2);
  await page.waitForTimeout(900); // The barge-in detector ignores playback onset.
  const pauses = await page.evaluate(() => {
    const voice = (window as unknown as { globeVoice: VoiceBoundary })
      .globeVoice;
    voice.gain.gain.value = 1;
    return voice.pauses;
  });
  await expect.poll(() => voiceStarts(page)).toBe(2);
  await expectState(page, "listening");
  await expect(canvas).toHaveAttribute("data-audio-source", "measured");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { globeVoice: VoiceBoundary }).globeVoice.pauses,
    ),
  ).toBeGreaterThan(pauses);
  await talk.click();
  await expectState(page, "idle");
  await expect(canvas).toHaveAttribute("data-audio-source", "none");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-level")))
    .toBe(0);
  expect(await canvas.getAttribute("data-rotation")).not.toBe(rotation);
});

test("live globe device fallback pulses only during speech and clears on interrupt and Stop", async ({
  users,
}) => {
  const [user] = await users(1);
  const page = user.page;
  await installVoiceBoundaries(page);
  await page.route("**/api/jarvis/voice/greeting", (route) =>
    route.fulfill({ status: 503, json: { error: "voice_unavailable" } }),
  );
  await page.goto("/home");
  const canvas = globeCanvas(page);
  const mic = page.getByRole("button", {
    name: "Start voice input",
    exact: true,
  });
  await mic.click();
  await expect.poll(() => voiceStarts(page)).toBe(1);
  await utter(page);
  await expectState(page, "error-or-fallback");
  await expect(canvas).toHaveAttribute("data-audio-source", "timed");
  // Synthetic motion is labeled timed; the measured level still reports silence.
  await expect(canvas).toHaveAttribute("data-level", "0.000");
  const pulse = await canvas.getAttribute("data-scale");
  await expect.poll(() => canvas.getAttribute("data-scale")).not.toBe(pulse);
  await mic.click();
  await expect.poll(() => voiceStarts(page)).toBe(2);
  await expectState(page, "listening");
  await expect(canvas).toHaveAttribute("data-audio-source", "measured");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-level")))
    .toBe(0);
  // A delayed callback from cancelled device speech cannot revive the old turn.
  await page.evaluate(() => {
    const utterance = (window as unknown as { globeVoice: VoiceBoundary })
      .globeVoice.utterance;
    utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
  });
  await expectState(page, "listening");
  await utter(page);
  await expectState(page, "error-or-fallback");
  await expect(canvas).toHaveAttribute("data-audio-source", "timed");
  const cancels = await page.evaluate(
    () =>
      (window as unknown as { globeVoice: VoiceBoundary }).globeVoice.cancels,
  );
  await page
    .getByRole("button", { name: "Stop speaking", exact: true })
    .click();
  await expectState(page, "idle");
  await expect(canvas).toHaveAttribute("data-audio-source", "none");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-level")))
    .toBe(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { globeVoice: VoiceBoundary }).globeVoice.cancels,
    ),
  ).toBeGreaterThan(cancels);
  await page.waitForTimeout(200);
  await expect(canvas).toHaveAttribute("data-level", "0.000");
});

test("live globe pulses action requested only after approved iPhone Play Vamp dispatch", async ({
  users,
}) => {
  const [user] = await users(1);
  const page = user.page;
  await installVoiceBoundaries(page, true);
  await saveVampConnection(page);
  await page.goto("/home");
  await expectState(page, "idle");
  await page.getByRole("button", { name: "Play Vamp", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Play Vamp", exact: true });
  await expect(dialog).toBeVisible();
  await expectState(page, "idle");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { globeVoice: VoiceBoundary }).globeVoice
          .launches,
    ),
  ).toEqual([]);
  await dialog
    .getByRole("button", { name: "Send Play Request", exact: true })
    .click();
  await expectState(page, "action-requested");
  await expect(page.locator(".hologram-live-status")).not.toContainText(
    /playing/i,
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { globeVoice: VoiceBoundary }).globeVoice
          .launches,
    ),
  ).toEqual([{ name: SAVED_VAMP_SHORTCUT, url: SAVED_VAMP_URL }]);
  await expectState(page, "idle");
  await expect(
    page.getByText("Playback requested — awaiting confirmation", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(globeCanvas(page)).toHaveAttribute("data-audio-source", "none");
});

test("live globe reduced motion freezes rotation and scaling while states keep distinct colors", async ({
  users,
}) => {
  const [user] = await users(1);
  const page = user.page;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installVoiceBoundaries(page, true);
  await saveVampConnection(page);
  const greeting = await holdGreeting(page);
  await page.goto("/home");
  const canvas = globeCanvas(page);
  await expect(canvas).toBeVisible();
  const colors = new Set<string>();
  const record = async (state: LiveState) => {
    await expectState(page, state);
    colors.add((await canvas.getAttribute("data-core-color"))!);
  };
  await record("idle");
  const rotation = await canvas.getAttribute("data-rotation");
  const ringRotation = await canvas.getAttribute("data-ring-rotation");
  const mic = page.getByRole("button", {
    name: "Start voice input",
    exact: true,
  });
  await mic.click();
  await expect.poll(() => voiceStarts(page)).toBe(1);
  await record("listening");
  await page.evaluate(() => {
    (
      window as unknown as { globeVoice: VoiceBoundary }
    ).globeVoice.gain.gain.value = 1;
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-level")))
    .toBeGreaterThan(0.01);
  await utter(page);
  await expect.poll(greeting.requested).toBe(1);
  await record("thinking");
  greeting.release();
  await record("speaking");
  await mic.click();
  await expect.poll(() => voiceStarts(page)).toBe(2);
  await page.unroute("**/api/jarvis/voice/greeting");
  await page.route("**/api/jarvis/voice/greeting", (route) =>
    route.fulfill({ status: 503, json: { error: "voice_unavailable" } }),
  );
  await utter(page);
  await record("error-or-fallback");
  await page.waitForTimeout(180);
  const scale = await canvas.getAttribute("data-scale");
  const opacity = await canvas.getAttribute("data-opacity");
  await page.waitForTimeout(220);
  await expect(canvas).toHaveAttribute("data-rotation", rotation!);
  await expect(canvas).toHaveAttribute("data-ring-rotation", ringRotation!);
  await expect(canvas).toHaveAttribute("data-scale", scale!);
  await expect(canvas).toHaveAttribute("data-opacity", opacity!);
  expect(Number(scale)).toBe(1);
  await page
    .getByRole("button", { name: "Stop speaking", exact: true })
    .click();
  await expectState(page, "idle");
  await page.getByRole("button", { name: "Play Vamp", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Play Vamp", exact: true })
    .getByRole("button", { name: "Send Play Request", exact: true })
    .click();
  await record("action-requested");
  expect(colors.size).toBe(6);
  await expectState(page, "idle");
  await expect(canvas).toHaveAttribute("data-rotation", rotation!);
  await expect(canvas).toHaveAttribute("data-ring-rotation", ringRotation!);
});

test("live globe releases repeated Focus sessions, stops rendering while hidden and resumes", async ({
  users,
}) => {
  const [user] = await users(1);
  const page = user.page;
  await installVoiceBoundaries(page);
  await page.goto("/home");
  const canvas = globeCanvas(page);
  for (let cycle = 0; cycle < 2; cycle++) {
    await page
      .getByRole("button", { name: "Full Screen Focus", exact: true })
      .click();
    await expect(canvas).toHaveCount(0);
    const stopped = await page.evaluate(
      () =>
        (window as unknown as { globeVoice: VoiceBoundary }).globeVoice.renders,
    );
    await page.waitForTimeout(180);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { globeVoice: VoiceBoundary }).globeVoice
            .renders,
      ),
    ).toBe(stopped);
    await page
      .getByRole("button", { name: "Exit Focus Mode", exact: true })
      .click();
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toBeVisible();
  }
  const talk = page.getByRole("button", { name: "Talk mode", exact: true });
  for (let cycle = 0; cycle < 2; cycle++) {
    await talk.click();
    await expectState(page, "listening");
    await talk.click();
    await expectState(page, "idle");
    await expect(canvas).toHaveCount(1);
  }
  await talk.click();
  await expect.poll(() => voiceStarts(page)).toBe(3);
  await expectState(page, "listening");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { globeVoice: VoiceBoundary }).globeVoice
            .renders,
      ),
    )
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(canvas).toHaveAttribute("data-paused", "true");
  await expect(talk).toHaveAttribute("aria-pressed", "false");
  const hidden = await page.evaluate(() => ({
    renders: (window as unknown as { globeVoice: VoiceBoundary }).globeVoice
      .renders,
    rotation: document.querySelector<HTMLCanvasElement>(
      ".holographic-globe canvas",
    )!.dataset.rotation,
    tracksEnded: (
      window as unknown as { globeVoice: VoiceBoundary }
    ).globeVoice.streams.every((stream) =>
      stream.getTracks().every((track) => track.readyState === "ended"),
    ),
  }));
  expect(hidden.tracksEnded).toBe(true);
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { globeVoice: VoiceBoundary }).globeVoice.renders,
    ),
  ).toBe(hidden.renders);
  await expect(canvas).toHaveAttribute("data-rotation", hidden.rotation!);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(canvas).toHaveAttribute("data-paused", "false");
  await expectState(page, "idle");
  await expect
    .poll(() => canvas.getAttribute("data-rotation"))
    .not.toBe(hidden.rotation);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { globeVoice: VoiceBoundary }).globeVoice
            .renders,
      ),
    )
    .toBeGreaterThan(hidden.renders);
  expect(await voiceStarts(page)).toBe(3);
  await expect(canvas).toHaveAttribute("data-audio-source", "none");
});
