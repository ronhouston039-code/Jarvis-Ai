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

async function prepareIPhone(page: Page, voice = false) {
  await page.addInitScript(
    ({ voice }) => {
      Object.defineProperty(navigator, "userAgent", {
        get: () =>
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      });
      Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
      const state = window as unknown as {
        vampLaunches: Array<{ name: string; url: string }>;
        vampVoiceStarts: number;
        vampRecognition: { onresult?: (event: unknown) => void };
        vampUtterances: string[];
        vampStreams: MediaStream[];
      };
      state.vampLaunches = [];
      state.vampVoiceStarts = 0;
      state.vampUtterances = [];
      state.vampStreams = [];
      window.addEventListener("jarvis-music-shortcut-launch", (event) => {
        // Record the reviewed native handoff without opening an external app.
        event.preventDefault();
        state.vampLaunches.push((event as CustomEvent).detail);
      });
      if (!voice) return;
      Object.defineProperty(window, "speechSynthesis", {
        value: {
          cancel() {},
          speak(utterance: SpeechSynthesisUtterance) {
            state.vampUtterances.push(utterance.text);
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
            state.vampRecognition = this;
            state.vampVoiceStarts++;
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
        state.vampStreams.push(stream);
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
          vampLaunches: Array<{ name: string; url: string }>;
        }
      ).vampLaunches,
  );
}

test("iPhone Vamp quick action and music card review require explicit confirmation", async ({
  users,
}) => {
  const [user] = await users(1);
  await prepareIPhone(user.page);
  await saveVampConnection(user.page);
  await user.page.goto("/home");
  await user.page
    .getByRole("button", { name: "Play Vamp", exact: true })
    .click();
  const dialog = user.page.getByRole("dialog", {
    name: "Play Vamp",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      "This will ask your iPhone to start Vamp in Apple Music.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await launches(user.page)).toEqual([]);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await launches(user.page)).toEqual([]);
  await expect(
    user.page.getByText("Apple Music request dispatched: Play Vamp", {
      exact: true,
    }),
  ).toHaveCount(0);
  await user.page
    .getByRole("button", { name: "Review Play Vamp request", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  expect(await launches(user.page)).toEqual([]);
  await dialog
    .getByRole("button", { name: "Send Play Request", exact: true })
    .click();
  expect(await launches(user.page)).toEqual([
    { name: SAVED_VAMP_SHORTCUT, url: SAVED_VAMP_URL },
  ]);
  await expect(dialog).not.toBeVisible();
});

test("iPhone Play Vamp text resolves the saved connection and stays requested until manually confirmed", async ({
  users,
}) => {
  const [user] = await users(1);
  await prepareIPhone(user.page);
  let llmRequests = 0;
  await user.page.route("**/api/ai/chat", (route) => {
    llmRequests++;
    return route.fulfill({
      status: 503,
      json: { error: "unexpected_llm_request" },
    });
  });
  await saveVampConnection(user.page);
  await user.page.goto("/home");
  await user.page.getByRole("button", { name: "CHAT", exact: true }).click();
  await user.page
    .getByRole("textbox", { name: "Message JARVIS", exact: true })
    .fill("Play Vamp");
  await user.page
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await user.page
    .getByRole("dialog", { name: "Play Vamp" })
    .getByRole("button", { name: "Send Play Request", exact: true })
    .click();
  const entry = user.page.getByText(
    "Apple Music request dispatched: Play Vamp",
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
  await expect(
    user.page.getByText("Playback requested — awaiting confirmation", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await launches(user.page)).toHaveLength(1);
  await expect(
    user.page.getByText("Playing: Vamp", { exact: true }),
  ).toHaveCount(0);
  await user.page
    .getByRole("button", { name: "Confirm Playing", exact: true })
    .click();
  await expect(
    user.page.getByText("Reported playing: Vamp", { exact: true }),
  ).toBeVisible();
  await expect(
    user.page.getByText("User-reported — not provider verified", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    user.page.getByText("Playing: Vamp", { exact: true }),
  ).toHaveCount(0);
  const confirmed = user.page.getByText(
    "User reported playback started: Vamp",
    {
      exact: true,
    },
  );
  await expect(confirmed).toBeVisible();
  const confirmedAt = await confirmed
    .locator("..")
    .locator("time")
    .getAttribute("datetime");
  expect(Number.isFinite(Date.parse(confirmedAt ?? ""))).toBe(true);
  expect(await launches(user.page)).toHaveLength(1);
  expect(llmRequests).toBe(0);
  await user.page.reload();
  await expect(
    user.page.getByText("User reported playback started: Vamp", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    user.page.getByText("Reported playing: Vamp", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await launches(user.page)).toEqual([]);
  expect(llmRequests).toBe(0);
});

test("iPhone Vamp Talk intent opens review without an LLM call and speaks truthful dispatch", async ({
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
  await saveVampConnection(user.page);
  await user.page.goto("/home");
  await user.page
    .getByRole("button", { name: "Start continuous voice session" })
    .click();
  await user.page.waitForFunction(
    () =>
      (window as unknown as { vampVoiceStarts: number }).vampVoiceStarts === 1,
  );
  await user.page.evaluate(() =>
    (
      window as unknown as {
        vampRecognition: { onresult: (event: unknown) => void };
      }
    ).vampRecognition.onresult({
      results: [
        Object.assign([{ transcript: "Jarvis, play Vamp" }], { isFinal: true }),
      ],
    }),
  );
  const dialog = user.page.getByRole("dialog", {
    name: "Play Vamp",
  });
  await expect(dialog).toBeVisible();
  expect(llmRequests).toBe(0);
  expect(await launches(user.page)).toEqual([]);
  await dialog
    .getByRole("button", { name: "Send Play Request", exact: true })
    .click();
  await expect
    .poll(() =>
      user.page.evaluate(
        () =>
          (window as unknown as { vampUtterances: string[] }).vampUtterances,
      ),
    )
    .toContain("Sending the Vamp play request now, Sir.");
  await expect(
    user.page.getByText("Playback requested — awaiting confirmation", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await launches(user.page)).toEqual([
    { name: SAVED_VAMP_SHORTCUT, url: SAVED_VAMP_URL },
  ]);
  expect(llmRequests).toBe(0);
  await expect(
    user.page.getByRole("button", { name: "End voice session", exact: true }),
  ).toHaveCount(0);
  expect(
    await user.page.evaluate(() =>
      (window as unknown as { vampStreams: MediaStream[] }).vampStreams.every(
        (stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
      ),
    ),
  ).toBe(true);
});

test("iPhone Vamp Not Playing records an unconfirmed outcome without retry or LLM call", async ({
  users,
}) => {
  const [user] = await users(1);
  await prepareIPhone(user.page);
  let llmRequests = 0;
  await user.page.route("**/api/ai/chat", (route) => {
    llmRequests++;
    return route.fulfill({
      status: 503,
      json: { error: "unexpected_llm_request" },
    });
  });
  await saveVampConnection(user.page);
  await user.page.goto("/home");
  await user.page
    .getByRole("button", { name: "Play Vamp", exact: true })
    .click();
  await user.page
    .getByRole("dialog", { name: "Play Vamp" })
    .getByRole("button", { name: "Send Play Request", exact: true })
    .click();
  await expect(
    user.page.getByText("Playback requested — awaiting confirmation", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await launches(user.page)).toHaveLength(1);
  await user.page
    .getByRole("button", { name: "Not Playing", exact: true })
    .click();
  await expect(
    user.page.getByText("Playback not confirmed", { exact: true }),
  ).toBeVisible();
  const entry = user.page.getByText(
    "User reported playback did not start: Vamp",
    {
      exact: true,
    },
  );
  await expect(entry).toBeVisible();
  await expect(
    user.page.getByText("User-reported — not provider verified", {
      exact: true,
    }),
  ).toBeVisible();
  const timestamp = await entry
    .locator("..")
    .locator("time")
    .getAttribute("datetime");
  expect(Number.isFinite(Date.parse(timestamp ?? ""))).toBe(true);
  await expect(
    user.page.getByText("Playing: Vamp", { exact: true }),
  ).toHaveCount(0);
  expect(await launches(user.page)).toEqual([
    { name: SAVED_VAMP_SHORTCUT, url: SAVED_VAMP_URL },
  ]);
  expect(llmRequests).toBe(0);
});
