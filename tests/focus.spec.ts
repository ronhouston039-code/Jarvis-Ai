import { test, expect, loadAllTestAccounts } from "deepspace/testing";
test.skip(loadAllTestAccounts().length < 1, "Requires test account");
test("Focus view has live microphone analysis, interim captions, keyboard and clean exit", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.addInitScript(() => {
    const state = window as unknown as {
      recognition: { onresult?: (e: unknown) => void };
      stream: MediaStream;
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
      target.stream.getTracks()[0].addEventListener("ended", () => {
        oscillator.stop();
        void context.close();
      });
      return target.stream;
    };
  });
  await a.page.goto("/home");
  await a.page.getByRole("button", { name: "Open Jarvis Focus Mode" }).click();
  const focus = a.page.getByRole("region", { name: "Jarvis Focus Mode" });
  await expect(focus).toBeVisible();
  await expect(focus).toHaveCSS("background-color", "rgb(0, 2, 6)");
  await a.page.getByRole("button", { name: "Start Focus listening" }).click();
  await expect(a.page.getByText("LISTENING…", { exact: true })).toBeVisible();
  await expect
    .poll(() => a.page.locator("canvas").getAttribute("data-level"))
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
    a.page.getByText("Turn on my lamp", { exact: true }),
  ).toBeVisible();
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
  await a.page.keyboard.press("Escape");
  await expect(focus).not.toBeVisible();
  await expect(
    a.page.getByRole("button", { name: "Open Jarvis Focus Mode" }),
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
  await a.page.goto("/home");
  await a.page.getByRole("button", { name: "Open Jarvis Focus Mode" }).click();
  await a.page.getByRole("button", { name: "Show Focus keyboard" }).click();
  await a.page
    .getByRole("textbox", { name: "Message JARVIS in Focus Mode" })
    .fill("repeat greeting");
  await a.page.getByRole("button", { name: "Send Focus message" }).click();
  await expect(
    a.page.getByText("JARVIS IS SPEAKING…", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Number(await a.page.locator("canvas").getAttribute("data-level")),
    )
    .toBeGreaterThan(0.01);
  await a.page.getByRole("button", { name: "Stop Focus speech" }).click();
  await expect(a.page.getByText("READY", { exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      Number(await a.page.locator("canvas").getAttribute("data-level")),
    )
    .toBeLessThan(0.01);
});
