import { test, expect, loadAllTestAccounts } from "deepspace/testing";
import { startupAudio } from "../src/jarvis/startup-audio";
test.skip(
  loadAllTestAccounts().length < 1,
  "Requires a DeepSpace test account.",
);
test("saved greeting plays once after activation and repeats only on command", async ({
  users,
}) => {
  const [a] = await users(1);
  let greetings = 0,
    chats = 0;
  await a.page.route("**/api/jarvis/capabilities", (r) =>
    r.fulfill({
      json: {
        llmMode: "deepspace",
        fishVoice: true,
        serverTranscription: false,
      },
    }),
  );
  await a.page.route("**/api/jarvis/voice/greeting", (r) => {
    greetings++;
    return r.fulfill({
      contentType: "audio/mpeg",
      body: Buffer.from(startupAudio, "base64"),
    });
  });
  a.page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/ai/chat") chats++;
  });
  await a.page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", {
      value: class {
        lang = "en-US";
        continuous = false;
        interimResults = false;
        onresult?: (event: { results: { transcript: string }[][] }) => void;
        onend?: () => void;
        start() {
          queueMicrotask(() =>
            this.onresult?.({
              results: [[{ transcript: "Jarvis repeat greeting" }]],
            }),
          );
        }
        stop() {
          this.onend?.();
        }
      },
    });
    HTMLMediaElement.prototype.play = function () {
      (window as unknown as { lastAudio: HTMLMediaElement }).lastAudio = this;
      return Promise.resolve();
    };
  });
  await a.page.goto("/home");
  await expect(
    a.page.getByRole("button", { name: "Voice on · turn off", exact: true }),
  ).toBeVisible();
  expect(greetings).toBe(0);
  await a.page.getByRole("button", { name: "HOME", exact: true }).click();
  await expect.poll(() => greetings).toBe(1);
  await expect(
    a.page.getByText("Jarvis is speaking…", { exact: true }),
  ).toBeVisible();
  await expect(
    a.page.getByRole("button", { name: /play greeting|Start JARVIS/i }),
  ).toHaveCount(0);
  await expect(a.page.locator("audio[controls]")).toHaveCount(0);
  await a.page.getByRole("button", { name: "CHAT", exact: true }).click();
  expect(greetings).toBe(1);
  await a.page
    .getByRole("textbox", { name: "Message JARVIS" })
    .fill("Jarvis, repeat greeting");
  await a.page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => greetings).toBe(2);
  expect(chats).toBe(0);
  await a.page
    .getByRole("button", { name: "Start voice input", exact: true })
    .click();
  await expect.poll(() => greetings).toBe(3);
  expect(chats).toBe(0);
  await expect(
    a.page.getByRole("textbox", { name: "Message JARVIS" }),
  ).toHaveValue("");
  await a.page
    .getByRole("button", { name: "Stop speaking", exact: true })
    .click();
  await expect(
    a.page.getByText("Jarvis is speaking…", { exact: true }),
  ).toHaveCount(0);
  await a.page.reload();
  await a.page.getByRole("button", { name: "HOME", exact: true }).click();
  expect(greetings).toBe(3);
});
