import { expect, loadAllTestAccounts, test } from "deepspace/testing";
import type { Page } from "@playwright/test";

test.skip(loadAllTestAccounts().length < 1, "Requires test account");

async function installVoiceMocks(page: Page, device = false) {
  await page.addInitScript(
    ({ device }) => {
      const state = window as unknown as {
        voiceStarts: number;
        voiceRecognition: { onresult?: (event: unknown) => void };
        voiceGain: GainNode;
        voiceStreams: MediaStream[];
        voicePauses: number;
        deviceCancels: number;
        voiceAudio: HTMLMediaElement;
      };
      state.voiceStarts = state.voicePauses = state.deviceCancels = 0;
      state.voiceStreams = [];
      Object.defineProperty(window, "SpeechRecognition", {
        value: class {
          onresult?: (event: unknown) => void;
          onend?: () => void;
          start() {
            state.voiceRecognition = this;
            state.voiceStarts++;
          }
          stop() {
            this.onend?.();
          }
        },
      });
      HTMLMediaElement.prototype.play = function () {
        state.voiceAudio = this;
        return Promise.resolve();
      };
      const originalPause = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.pause = function () {
        state.voicePauses++;
        originalPause.call(this);
      };
      if (device)
        Object.defineProperty(window, "speechSynthesis", {
          value: {
            cancel() {
              state.deviceCancels++;
            },
            speak(utterance: SpeechSynthesisUtterance) {
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
        state.voiceGain = gain;
        state.voiceStreams.push(destination.stream);
        const track = destination.stream.getTracks()[0];
        const originalStop = track.stop.bind(track);
        track.stop = () => {
          originalStop();
          oscillator.stop();
          void context.close();
        };
        return destination.stream;
      };
    },
    { device },
  );
}

test("wake mode requires consent, ignores ambient speech and expires bare activation", async ({
  users,
}) => {
  const [user] = await users(1);
  const { startupAudio } = await import("../src/jarvis/startup-audio");
  await installVoiceMocks(user.page);
  let greetingRequests = 0;
  await user.page.route("**/api/tts", (route) =>
    route.fulfill({
      contentType: "audio/mpeg",
      body: Buffer.from(startupAudio, "base64"),
    }),
  );
  await user.page.route("**/api/jarvis/voice/greeting", (route) => {
    greetingRequests++;
    return route.fulfill({
      contentType: "audio/mpeg",
      body: Buffer.from(startupAudio, "base64"),
    });
  });
  await user.page.goto("/home");
  const wake = user.page.getByRole("button", {
    name: "Wake Jarvis",
    exact: true,
  });
  await wake.click();
  const consent = user.page.getByRole("dialog", {
    name: /Enable.*Jarvis.*wake listening/,
  });
  await expect(consent).toContainText("may process microphone audio online");
  expect(
    await user.page.evaluate(
      () => (window as unknown as { voiceStarts: number }).voiceStarts,
    ),
  ).toBe(0);
  await consent.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(wake).toHaveAttribute("aria-pressed", "false");
  await wake.click();
  await consent
    .getByRole("button", { name: "Enable wake listening", exact: true })
    .click();
  await expect(wake).toHaveAttribute("aria-pressed", "true");
  await user.page.waitForFunction(
    () => (window as unknown as { voiceStarts: number }).voiceStarts === 1,
  );
  await utter(user.page, "repeat greeting");
  await user.page.waitForFunction(
    () => (window as unknown as { voiceStarts: number }).voiceStarts === 2,
  );
  expect(greetingRequests).toBe(0);
  await utter(user.page, "Jarvis");
  await expect(user.page.locator(".assistant-panel")).toContainText(
    "Listening, Sir.",
  );
  await user.page.waitForFunction(
    () => !!(window as unknown as { voiceAudio?: HTMLMediaElement }).voiceAudio,
  );
  await user.page.evaluate(() => {
    (
      window as unknown as { voiceAudio: HTMLMediaElement }
    ).voiceAudio.dispatchEvent(new Event("ended"));
    const now = Date.now.bind(Date);
    Date.now = () => now() + 20000;
  });
  await user.page.waitForFunction(
    () => (window as unknown as { voiceStarts: number }).voiceStarts === 3,
  );
  await utter(user.page, "repeat greeting");
  await user.page.waitForFunction(
    () => (window as unknown as { voiceStarts: number }).voiceStarts === 4,
  );
  expect(greetingRequests).toBe(0);
  await utter(user.page, "Hey Jarvis, repeat greeting");
  await expect.poll(() => greetingRequests).toBe(1);
  await user.page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(wake).toHaveAttribute("aria-pressed", "false");
  expect(
    await user.page.evaluate(() =>
      (window as unknown as { voiceStreams: MediaStream[] }).voiceStreams.every(
        (stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
      ),
    ),
  ).toBe(true);
});

test("ambient transcripts do not extend wake listening beyond its inactivity timeout", async ({
  users,
}) => {
  const [user] = await users(1);
  await installVoiceMocks(user.page);
  await user.page.goto("/home");
  await user.page.clock.install();
  const wake = user.page.getByRole("button", {
    name: "Wake Jarvis",
    exact: true,
  });
  await wake.click();
  await user.page
    .getByRole("button", { name: "Enable wake listening", exact: true })
    .click();
  await user.page.waitForFunction(
    () => (window as unknown as { voiceStarts: number }).voiceStarts === 1,
  );
  await user.page.clock.fastForward(119000);
  await utter(user.page, "unrelated room conversation");
  await user.page.clock.fastForward(2700);
  await expect(wake).toHaveAttribute("aria-pressed", "false");
  expect(
    await user.page.evaluate(() =>
      (window as unknown as { voiceStreams: MediaStream[] }).voiceStreams.every(
        (stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
      ),
    ),
  ).toBe(true);
});

async function utter(page: Page, transcript: string) {
  await page.evaluate((text) => {
    (
      window as unknown as {
        voiceRecognition: { onresult: (event: unknown) => void };
      }
    ).voiceRecognition.onresult({
      results: [Object.assign([{ transcript: text }], { isFinal: true })],
    });
  }, transcript);
}

for (const device of [false, true]) {
  test(`continuous voice interrupts ${device ? "device fallback" : "Fish Audio"} playback on sustained user speech`, async ({
    users,
  }) => {
    const [user] = await users(1);
    const { startupAudio } = await import("../src/jarvis/startup-audio");
    await installVoiceMocks(user.page, device);
    await user.page.route("**/api/jarvis/capabilities", (route) =>
      route.fulfill({ json: { fishVoice: false } }),
    );
    await user.page.route("**/api/jarvis/voice/greeting", (route) =>
      device
        ? route.fulfill({ status: 503, json: { error: "voice_unavailable" } })
        : route.fulfill({
            contentType: "audio/mpeg",
            body: Buffer.from(startupAudio, "base64"),
          }),
    );
    await user.page.goto("/home");
    await user.page
      .getByRole("button", { name: "Start continuous voice session" })
      .click();
    const focus = user.page.getByRole("region", { name: "Jarvis Focus Mode" });
    await user.page.waitForFunction(
      () => (window as unknown as { voiceStarts: number }).voiceStarts === 1,
    );
    await utter(user.page, "repeat greeting");
    await expect(
      focus.getByText("JARVIS IS SPEAKING…", { exact: true }),
    ).toBeVisible();
    await user.page.waitForFunction(
      () =>
        (window as unknown as { voiceStreams: MediaStream[] }).voiceStreams
          .length === 2,
    );
    // Playback onset/noise must not interrupt the assistant.
    await user.page.waitForTimeout(900);
    expect(
      await user.page.evaluate(
        () => (window as unknown as { voiceStarts: number }).voiceStarts,
      ),
    ).toBe(1);
    const cancels = await user.page.evaluate((isDevice) => {
      const state = window as unknown as {
        voicePauses: number;
        deviceCancels: number;
        voiceGain: GainNode;
      };
      state.voiceGain.gain.value = 1;
      return isDevice ? state.deviceCancels : state.voicePauses;
    }, device);
    await expect
      .poll(() =>
        user.page.evaluate(
          () => (window as unknown as { voiceStarts: number }).voiceStarts,
        ),
      )
      .toBe(2);
    await expect(focus.getByText("LISTENING…", { exact: true })).toBeVisible();
    expect(
      await user.page.evaluate((isDevice) => {
        const state = window as unknown as {
          voicePauses: number;
          deviceCancels: number;
        };
        return isDevice ? state.deviceCancels : state.voicePauses;
      }, device),
    ).toBeGreaterThan(cancels);
    await user.page.getByRole("button", { name: "End voice session" }).click();
    expect(
      await user.page.evaluate(() =>
        (
          window as unknown as { voiceStreams: MediaStream[] }
        ).voiceStreams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
        ),
      ),
    ).toBe(true);
    await expect(focus.getByText("READY", { exact: true })).toBeVisible();
  });
}
