import { openHomeMenu, mockHomeMapTiles } from "./helpers/home-controls";
import { expect, loadAllTestAccounts, test } from "deepspace/testing";
import type { Page } from "@playwright/test";

test.skip(loadAllTestAccounts().length < 1, "Requires test account");

async function prepareIPhone(page: Page, voice = false) {
  await mockHomeMapTiles(page);
  await page.route("**/api/health", r => r.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/jarvis/connections/home-assistant/config", r => r.fulfill({ json: { available: false, enabled: false } }));
  await page.route("**/api/jarvis/connections/weather", r => r.fulfill({ json: { location: "Goldsboro", temperature: 70, feelsLike: 68, description: "Clear", retrievedAt: "2026-10-05T12:00:00Z" } }));
  await page.addInitScript(
    ({ voice }) => {
      Object.defineProperty(navigator, "userAgent", {
        get: () =>
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      });
      Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
      const state = window as unknown as {
        tvShortcutLaunches: Array<{ action: string; url: string }>;
        tvRecognition: { onresult?: (event: unknown) => void };
        tvVoiceStarts: number;
        tvUtterances: string[];
        tvStreams: MediaStream[];
      };
      state.tvShortcutLaunches = [];
      state.tvVoiceStarts = 0;
      state.tvUtterances = [];
      state.tvStreams = [];
      window.addEventListener("jarvis-tv-shortcut-launch", (event) => {
        // Suppress only the native handoff in the test; the requested/unverified
        // activity and the user's separate state confirmation still run normally.
        event.preventDefault();
        state.tvShortcutLaunches.push((event as CustomEvent).detail);
      });
      if (!voice) return;
      Object.defineProperty(window, "speechSynthesis", {
        value: {
          cancel() {},
          speak(utterance: SpeechSynthesisUtterance) {
            state.tvUtterances.push(utterance.text);
            utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
            utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
          },
        },
      });
      Object.defineProperty(window, "SpeechRecognition", {
        value: class {
          onresult?: (event: unknown) => void;
          onend?: () => void;
          start() {
            state.tvRecognition = this;
            state.tvVoiceStarts++;
          }
          stop() {
            this.onend?.();
          }
        },
      });
      navigator.mediaDevices.getUserMedia = async () => {
        const context = new AudioContext();
        await context.resume();
        const stream = context.createMediaStreamDestination().stream;
        state.tvStreams.push(stream);
        const track = stream.getTracks()[0];
        const originalStop = track.stop.bind(track);
        track.stop = () => {
          originalStop();
          void context.close();
        };
        return stream;
      };
    },
    { voice },
  );
  await page.route("**/api/jarvis/capabilities", (route) =>
    route.fulfill({ json: { fishVoice: false } }),
  );
  if (voice)
    await page.route("**/api/tts", (route) =>
      route.fulfill({ status: 503, json: { error: "test_device_fallback" } }),
    );
}

async function launches(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          tvShortcutLaunches: Array<{ action: string; url: string }>;
        }
      ).tvShortcutLaunches,
  );
}

test("iPhone TV actions require confirmation and cancellation launches nothing", async ({
  users,
}) => {
  const [user] = await users(1);
  await prepareIPhone(user.page);
  await user.page.goto("/home");
  await user.page.getByRole("button", { name: "TV", exact: true }).click();
  await user.page
    .getByRole("button", { name: "Turn Off TV", exact: true })
    .click();
  const off = user.page.getByRole("dialog", { name: "Turn off KY TV now?" });
  await expect(off).toBeVisible();
  expect(await launches(user.page)).toEqual([]);
  await off.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(off).not.toBeVisible();
  expect(await launches(user.page)).toEqual([]);
  await expect(
    user.page.getByText("KY TV power command dispatched · Turn off", {
      exact: true,
    }),
  ).toHaveCount(0);
  await user.page.getByRole("button", { name: "TV", exact: true }).click();
  await user.page
    .getByRole("button", { name: "Turn On TV", exact: true })
    .click();
  const on = user.page.getByRole("dialog", { name: "Turn on KY TV now?" });
  await expect(on).toBeVisible();
  await on.getByRole("button", { name: "Run Tv On", exact: true }).click();
  expect(await launches(user.page)).toEqual([
    { action: "on", url: "shortcuts://run-shortcut?name=Tv%20On" },
  ]);
  await expect(
    user.page.getByText("KY TV power command dispatched · Turn on", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(user.page.getByText(/^On · user confirmed/i)).toHaveCount(0);
});

test("TV shortcut handoff stays unverified until the user confirms the result", async ({
  users,
}) => {
  const [user] = await users(1);
  await prepareIPhone(user.page);
  await user.page.goto("/home");
  await user.page.getByRole("button", { name: "TV", exact: true }).click();
  await user.page
    .getByRole("button", { name: "Turn Off TV", exact: true })
    .click();
  await user.page
    .getByRole("dialog", { name: "Turn off KY TV now?" })
    .getByRole("button", { name: "Run Tv Off", exact: true })
    .click();
  expect(await launches(user.page)).toEqual([
    { action: "off", url: "shortcuts://run-shortcut?name=Tv%20Off" },
  ]);
  const entry = user.page.getByText(
    "KY TV power command dispatched · Turn off",
    {
      exact: true,
    },
  );
  await expect(entry).toBeVisible();
  const timestamp = await entry
    .locator("..")
    .locator("time")
    .getAttribute("datetime");
  expect(Number.isFinite(Date.parse(timestamp ?? ""))).toBe(true);
  await expect(user.page.getByText(/^Off · user confirmed/i)).toHaveCount(0);
  await user.page
    .getByRole("button", { name: "Confirm TV is off", exact: true })
    .click();
  await expect(
    user.page.getByText(/^Off · user confirmed \(not device verified\)$/i),
  ).toBeVisible();
  // Confirming the observed result does not run the shortcut again.
  expect(await launches(user.page)).toHaveLength(1);
});

test("iPhone Talk TV intent opens the native confirmation without an LLM call", async ({
  users,
}) => {
  const [user] = await users(1);
  await prepareIPhone(user.page, true);
  let llmRequests = 0;
  await user.page.route("**/api/ai/chat", (route) => {
    llmRequests++;
    return route.fulfill({
      status: 503,
      json: { error: "unexpected_llm_request" },
    });
  });
  await user.page.goto("/home");
  await openHomeMenu(user.page);
  await user.page
    .getByRole("button", { name: "Start continuous voice session" })
    .click();
  await user.page.waitForFunction(
    () => (window as unknown as { tvVoiceStarts: number }).tvVoiceStarts === 1,
  );
  await user.page.evaluate(() =>
    (
      window as unknown as {
        tvRecognition: { onresult: (event: unknown) => void };
      }
    ).tvRecognition.onresult({
      results: [
        Object.assign([{ transcript: "Jarvis, turn off the TV." }], {
          isFinal: true,
        }),
      ],
    }),
  );
  const dialog = user.page.getByRole("dialog", { name: "Turn off KY TV now?" });
  await expect(dialog).toBeVisible();
  expect(llmRequests).toBe(0);
  expect(await launches(user.page)).toEqual([]);
  await dialog.getByRole("button", { name: "Run Tv Off", exact: true }).click();
  await expect
    .poll(() =>
      user.page.evaluate(
        () => (window as unknown as { tvUtterances: string[] }).tvUtterances,
      ),
    )
    .toContain("Sending power command to the TV now, Sir.");
  await expect(
    user.page.getByText("Action Dispatched · Off unverified", { exact: true }),
  ).toBeVisible();
  expect(llmRequests).toBe(0);
  await expect(
    user.page.getByRole("button", { name: "End voice session", exact: true }),
  ).toHaveCount(0);
  expect(
    await user.page.evaluate(() =>
      (window as unknown as { tvStreams: MediaStream[] }).tvStreams.every(
        (stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
      ),
    ),
  ).toBe(true);
});
