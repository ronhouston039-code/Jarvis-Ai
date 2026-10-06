import { openHomeMenu, mockHomeMapTiles } from "./helpers/home-controls";
import { test, expect, loadAllTestAccounts } from "deepspace/testing";
test.skip(loadAllTestAccounts().length < 1, "Requires test account");
async function prepareFocus(page: import("@playwright/test").Page) {
  await mockHomeMapTiles(page);
  await page.route("**/api/health", r => r.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/jarvis/connections/home-assistant/config", r => r.fulfill({ json: { enabled: false, available: false } }));
  await page.route("**/api/jarvis/connections/weather", r => r.fulfill({ json: { location: "Goldsboro", temperature: 70, feelsLike: 68, description: "Clear", retrievedAt: "2026-10-05T12:00:00Z" } }));
}
test("Focus view has live microphone analysis, interim captions, keyboard and clean exit", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.addInitScript(() => {
    const state = window as unknown as {
      recognition: { onresult?: (e: unknown) => void };
      stream: MediaStream;
      oscillator: OscillatorNode;
    };
    Object.defineProperty(window, "SpeechRecognition", {
      value: class {
        onend?: () => void;
        onresult?: (e: unknown) => void;
        start() {
          state.recognition = this;
        }
        stop() {
          this.onend?.();
        }
      },
    });
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const oscillator = context.createOscillator();
      const target = context.createMediaStreamDestination();
      oscillator.connect(target);
      oscillator.start();
      state.stream = target.stream;
      state.oscillator = oscillator;
      target.stream.getTracks()[0].addEventListener("ended", () => {
        oscillator.stop();
        void context.close();
      });
      return target.stream;
    };
  });
  await prepareFocus(a.page);
  await a.page.goto("/home");
  await openHomeMenu(a.page);
  await a.page.getByRole("button", { name: "Full Screen Focus", exact: true }).click();
  const focus = a.page.getByRole("region", { name: "Jarvis Focus Mode" });
  await expect(focus).toBeVisible();
  await expect(
    a.page.locator(".jarvis-focus canvas[data-renderer=webgl]"),
  ).toBeVisible();
  await expect(a.page.locator(".jarvis-focus canvas")).toHaveAttribute(
    "data-nodes",
    "220",
  );
  await expect
    .poll(async () =>
      Number(
        await a.page
          .locator(".jarvis-focus canvas")
          .getAttribute("data-connections"),
      ),
    )
    .toBeGreaterThan(0);
  await expect(focus).toHaveCSS("background-color", "rgb(0, 2, 6)");
  await a.page.getByRole("button", { name: "Start Focus listening" }).click();
  await expect(focus.getByText("LISTENING…", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      a.page.locator(".jarvis-focus canvas").getAttribute("data-level"),
    )
    .not.toBe("0.000");
  await a.page.waitForFunction(() =>
    Boolean((window as unknown as { recognition: unknown }).recognition),
  );
  await a.page.evaluate(() => {
    const result = Object.assign([{ transcript: "Turn on my lamp" }], {
      isFinal: false,
    });
    (
      window as unknown as { recognition: { onresult: (e: unknown) => void } }
    ).recognition.onresult({ results: [result] });
  });
  await expect(
    a.page.getByText("“Turn on my lamp”", { exact: true }),
  ).toBeVisible();
  await a.page.evaluate(() => {
    (
      window as unknown as { oscillator: OscillatorNode }
    ).oscillator.frequency.value = 100;
  });
  await expect
    .poll(async () =>
      Number(
        await a.page.locator(".jarvis-focus canvas").getAttribute("data-bass"),
      ),
    )
    .toBeGreaterThan(0.1);
  await a.page.evaluate(() => {
    (
      window as unknown as { oscillator: OscillatorNode }
    ).oscillator.frequency.value = 6000;
  });
  await expect
    .poll(async () =>
      Number(
        await a.page.locator(".jarvis-focus canvas").getAttribute("data-high"),
      ),
    )
    .toBeGreaterThan(0.1);
  await a.page.getByRole("button", { name: "Show Focus keyboard" }).click();
  await expect(
    a.page.getByRole("textbox", { name: "Message JARVIS in Focus Mode" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      a.page.evaluate(
        () =>
          (window as unknown as { stream: MediaStream }).stream.getTracks()[0]
            .readyState,
      ),
    )
    .toBe("ended");
  await a.page.screenshot({ path: "test-results/jarvis-focus-desktop.png" });
  await a.page.setViewportSize({ width: 390, height: 844 });
  await a.page.getByRole("button", { name: "Hide Focus keyboard" }).click();
  await a.page.screenshot({ path: "test-results/jarvis-focus-mobile.png" });
  await a.page
    .locator("canvas")
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(
    a.page.locator(".jarvis-focus canvas[data-renderer=webgl]"),
  ).toHaveCount(0);
  await expect(a.page.locator("svg[data-renderer=svg]")).toBeVisible();
  await a.page.keyboard.press("Escape");
  await expect(focus).not.toBeVisible();
  await openHomeMenu(a.page);
  await expect(
    a.page.getByRole("button", { name: "Full Screen Focus", exact: true }),
  ).toBeVisible();
});

test("Focus orb analyses actual MP3 playback and Stop cancels speech", async ({
  users,
}) => {
  const [a] = await users(1);
  const { startupAudio } = await import("../src/jarvis/startup-audio");
  await a.page.route("**/api/jarvis/capabilities", (r) =>
    r.fulfill({ json: { fishVoice: false } }),
  );
  await a.page.route("**/api/jarvis/voice/greeting", (r) =>
    r.fulfill({
      contentType: "audio/mpeg",
      body: Buffer.from(startupAudio, "base64"),
    }),
  );
  await a.page.route("**/api/tts", r => r.fulfill({ contentType: "audio/mpeg", body: Buffer.from(startupAudio, "base64") }));
  await prepareFocus(a.page);
  await a.page.goto("/home");
  await openHomeMenu(a.page);
  await a.page.getByRole("button", { name: "Full Screen Focus", exact: true }).click();
  await a.page.getByRole("button", { name: "Show Focus keyboard" }).click();
  await a.page
    .getByRole("textbox", { name: "Message JARVIS in Focus Mode" })
    .fill("repeat greeting");
  await a.page.getByRole("button", { name: "Send Focus message" }).click();
  await expect(
    a.page
      .getByRole("region", { name: "Jarvis Focus Mode" })
      .getByText("JARVIS IS SPEAKING…", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Number(
        await a.page.locator(".jarvis-focus canvas").getAttribute("data-level"),
      ),
    )
    .toBeGreaterThan(0.01);
  await a.page.getByRole("button", { name: "Stop Focus speech" }).click();
  await expect(
    a.page
      .getByRole("region", { name: "Jarvis Focus Mode" })
      .getByText("READY", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Number(
        await a.page.locator(".jarvis-focus canvas").getAttribute("data-level"),
      ),
    )
    .toBeLessThan(0.01);
});

test("continuous voice starts Focus, rearms after speech, and ends locally", async ({
  users,
}) => {
  const [a] = await users(1);
  const { startupAudio } = await import("../src/jarvis/startup-audio");
  await a.page.route("**/api/jarvis/capabilities", (r) =>
    r.fulfill({ json: { fishVoice: false } }),
  );
  let release!: () => void;
  let voiceRequests = 0;
  // Isolate this speech lifecycle check from any saved location's live provider.
  await a.page.route("**/api/jarvis/connections/weather", r => r.fulfill({ json: {
    location: "Test location", temperature: 70, feelsLike: 68,
    retrievedAt: "2026-10-05T12:00:00Z", description: "Clear", high: 75, low: 55,
  } }));
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Until required health checks are verified, repeat greeting uses a truthful
  // status through TTS; both routes share the same controlled playback boundary.
  const greetingPlayback = async (r: import("@playwright/test").Route) => {
    voiceRequests++;
    await ready;
    return r.fulfill({
      contentType: "audio/mpeg",
      body: Buffer.from(startupAudio, "base64"),
    });
  };
  await a.page.route("**/api/jarvis/voice/greeting", greetingPlayback);
  await a.page.route("**/api/tts", greetingPlayback);
  await a.page.addInitScript(() => {
    const state = window as unknown as {
      recognition: { onresult?: (e: unknown) => void };
      starts: number;
      audio: HTMLAudioElement;
      stream: MediaStream;
    };
    state.starts = 0;
    Object.defineProperty(window, "SpeechRecognition", {
      value: class {
        onresult?: (e: unknown) => void;
        onend?: () => void;
        start() {
          state.recognition = this;
          state.starts++;
        }
        stop() {
          this.onend?.();
        }
      },
    });
    HTMLMediaElement.prototype.play = function () {
      state.audio = this as HTMLAudioElement;
      return Promise.resolve();
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext(),
        osc = ctx.createOscillator(),
        target = ctx.createMediaStreamDestination();
      osc.connect(target);
      osc.start();
      state.stream = target.stream;
      return target.stream;
    };
  });
  await prepareFocus(a.page);
  await a.page.goto("/home");
  await openHomeMenu(a.page);
  await a.page
    .getByRole("button", { name: "Start continuous voice session" })
    .click();
  const focus = a.page.getByRole("region", { name: "Jarvis Focus Mode" });
  await expect(focus).toBeVisible();
  await a.page.waitForFunction(
    () => (window as unknown as { starts: number }).starts === 1,
  );
  await a.page.evaluate(() =>
    (
      window as unknown as { recognition: { onresult: (e: unknown) => void } }
    ).recognition.onresult({
      results: [
        Object.assign([{ transcript: "repeat greeting" }], { isFinal: true }),
      ],
    }),
  );
  await expect(focus.getByText("THINKING…", { exact: true })).toBeVisible();
  await a.page.waitForTimeout(900);
  expect(
    await a.page.evaluate(
      () => (window as unknown as { starts: number }).starts,
    ),
  ).toBe(1);
  release();
  await expect(
    focus.getByText("JARVIS IS SPEAKING…", { exact: true }),
  ).toBeVisible();
  await a.page.evaluate(() => {
    const audio = (window as unknown as { audio: HTMLAudioElement }).audio;
    audio.dispatchEvent(new Event("ended"));
  });
  await expect
    .poll(() =>
      a.page.evaluate(() => (window as unknown as { starts: number }).starts),
    )
    .toBe(2);
  await a.page.getByRole("button", { name: "End voice session" }).click();
  await expect(
    a.page.getByRole("button", { name: "End voice session" }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      a.page.evaluate(
        () =>
          (window as unknown as { stream: MediaStream }).stream.getTracks()[0]
            .readyState,
      ),
    )
    .toBe("ended");
  await expect(focus.getByText("READY", { exact: true })).toBeVisible();
  await a.page.evaluate(() =>
    (
      window as unknown as { recognition: { onresult: (e: unknown) => void } }
    ).recognition.onresult({
      results: [
        Object.assign([{ transcript: "repeat greeting" }], { isFinal: true }),
      ],
    }),
  );
  await a.page.waitForTimeout(200);
  expect(voiceRequests).toBe(1);
});

test("unsupported WebGL uses SVG without throwing", async ({ users }) => {
  const [a] = await users(1);
  const errors: string[] = [];
  a.page.on("pageerror", (error) => errors.push(error.message));
  await a.page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await prepareFocus(a.page);
  await a.page.goto("/home?mode=focus");
  await expect(a.page.locator("svg[data-renderer=svg]")).toBeVisible();
  await expect(a.page.locator(".jarvis-focus canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
  await a.page.getByRole("button", { name: "Exit Focus Mode" }).click();
  await openHomeMenu(a.page);
  await expect(
    a.page.getByRole("button", { name: "Full Screen Focus", exact: true }),
  ).toBeVisible();
});

test("failed WebGL initialization disposes listeners and falls back to SVG", async ({
  users,
}) => {
  const [a] = await users(1);
  const errors: string[] = [];
  a.page.on("pageerror", (error) => errors.push(error.message));
  await a.page.addInitScript(() => {
    const state = window as unknown as {
      plexusObserverDisconnected: boolean;
      plexusPointerListenersRemoved: number;
    };
    state.plexusObserverDisconnected = false;
    state.plexusPointerListenersRemoved = 0;
    const originalRemove = HTMLElement.prototype.removeEventListener;
    HTMLElement.prototype.removeEventListener = function (
      ...args: Parameters<typeof originalRemove>
    ) {
      if (
        this.classList.contains("neural-plexus") &&
        String(args[0]).startsWith("pointer")
      ) {
        state.plexusPointerListenersRemoved++;
      }
      return originalRemove.apply(this, args);
    } as typeof originalRemove;
    const OriginalObserver = window.ResizeObserver;
    window.ResizeObserver = class extends OriginalObserver {
      private failedPlexus = false;
      observe(target: Element, options?: ResizeObserverOptions) {
        if (target.classList.contains("neural-plexus")) {
          this.failedPlexus = true;
          throw new Error("Injected initialization failure");
        }
        super.observe(target, options);
      }
      disconnect() {
        if (this.failedPlexus) state.plexusObserverDisconnected = true;
        super.disconnect();
      }
    };
  });
  await prepareFocus(a.page);
  await a.page.goto("/home?mode=focus");
  await expect(a.page.locator("svg[data-renderer=svg]")).toBeVisible();
  await expect(a.page.locator(".jarvis-focus canvas")).toHaveCount(0);
  const released = await a.page.evaluate(() => {
    const state = window as unknown as {
      plexusObserverDisconnected: boolean;
      plexusPointerListenersRemoved: number;
    };
    return {
      observer: state.plexusObserverDisconnected,
      listeners: state.plexusPointerListenersRemoved,
    };
  });
  expect(released.observer).toBe(true);
  expect(released.listeners).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test("mobile dashboard is one column with an accessible bottom microphone", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.setViewportSize({ width: 390, height: 844 });
  await prepareFocus(a.page);
  await a.page.goto("/home");
  await expect(
    a.page.getByRole("button", { name: "Start voice input", exact: true }),
  ).toBeVisible();
  const layout = await a.page.evaluate(() => {
    const dashboard = document
      .querySelector(".hud-dashboard")!
      .getBoundingClientRect();
    const main = document.querySelector(".hud-main")!.getBoundingClientRect();
    const support = document
      .querySelector(".j-home-map")!
      .getBoundingClientRect();
    const mic = document
      .querySelector('[aria-label="Start voice input"]')!
      .getBoundingClientRect();
    return {
      width: dashboard.width,
      supportAfter: support.top >= main.bottom - 1,
      micBottom: mic.bottom,
      micTop: mic.top,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  expect(layout.width).toBeLessThanOrEqual(390);
  expect(layout.supportAfter).toBe(true);
  expect(layout.micTop).toBeGreaterThan(0);
  expect(layout.micBottom).toBeLessThanOrEqual(844);
  expect(layout.overflow).toBe(false);
  await a.page.screenshot({
    path: "test-results/jarvis-mobile-responsive.png",
  });
});
