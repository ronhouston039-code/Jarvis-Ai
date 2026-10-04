import { expect, loadAllTestAccounts, test } from "deepspace/testing";
import type { Page } from "@playwright/test";

test.skip(loadAllTestAccounts().length < 1, "Requires test account");

const VAMP_PLAYLIST_ID = "pl.u-JPAZbAPTDzXod7v";
type TestPlayback = {
  playing: boolean;
  item?: {
    id: string;
    title: string;
    artistName: string;
    container?: { id: string; type: string };
  };
};
type TestMusicWindow = {
  MusicKit: unknown;
  vampLaunches: Array<{ name: string; url: string }>;
  vampMusicCalls: string[];
  vampMusicReads: number;
  setVampPlayback: (playback: TestPlayback) => void;
  emitVampPlayback: () => void;
};

async function prepareMusic(page: Page, initial: TestPlayback) {
  await page.route("**/api/jarvis/connections/apple-music/config", (route) =>
    route.fulfill({
      json: {
        available: true,
        developerToken: "mock-public-developer-token",
      },
    }),
  );
  await page.route("**/api/jarvis/capabilities", (route) =>
    route.fulfill({ json: { fishVoice: false } }),
  );
  await page.addInitScript(
    ({ initial }) => {
      Object.defineProperty(navigator, "userAgent", {
        get: () =>
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      });
      Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
      const state = window as unknown as TestMusicWindow;
      state.vampLaunches = [];
      state.vampMusicCalls = [];
      state.vampMusicReads = 0;
      window.addEventListener("jarvis-music-shortcut-launch", (event) => {
        event.preventDefault();
        state.vampLaunches.push((event as CustomEvent).detail);
      });

      const playbackKey = "jarvis-vamp-sdk-test-playback";
      const saved = sessionStorage.getItem(playbackKey);
      // Start each browser context clean, then keep both playback and audit
      // history through the reload exercised below.
      if (!saved) {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith("jarvis-vamp-shortcut:"))
            localStorage.removeItem(key);
        }
      }
      let playback: TestPlayback = saved ? JSON.parse(saved) : initial;
      sessionStorage.setItem(playbackKey, JSON.stringify(playback));
      const listeners = new Map<string, Set<() => void>>();
      const emit = (event: string) =>
        listeners.get(event)?.forEach((listener) => listener());
      state.emitVampPlayback = () => {
        emit("nowPlayingItemDidChange");
        emit("playbackStateDidChange");
        emit("playbackTimeDidChange");
      };
      state.setVampPlayback = (next) => {
        playback = next;
        sessionStorage.setItem(playbackKey, JSON.stringify(playback));
        state.emitVampPlayback();
      };
      const instance = {
        isAuthorized: true,
        get isPlaying() {
          return playback.playing;
        },
        get nowPlayingItem() {
          state.vampMusicReads++;
          return playback.item;
        },
        currentPlaybackTime: 84,
        currentPlaybackDuration: 258,
        authorize: async () => {
          state.vampMusicCalls.push("authorize");
          return "unused-test-user-token";
        },
        unauthorize: async () => {
          state.vampMusicCalls.push("unauthorize");
          instance.isAuthorized = false;
          emit("authorizationStatusDidChange");
        },
        setQueue: async () => {
          state.vampMusicCalls.push("setQueue");
        },
        play: async () => {
          state.vampMusicCalls.push("play");
          state.setVampPlayback({ ...playback, playing: true });
        },
        pause: () => {
          state.vampMusicCalls.push("pause");
          state.setVampPlayback({ ...playback, playing: false });
        },
        skipToNextItem: async () => {
          state.vampMusicCalls.push("next");
        },
        skipToPreviousItem: async () => {
          state.vampMusicCalls.push("previous");
        },
        addEventListener: (event: string, listener: () => void) => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(listener);
        },
        removeEventListener: (event: string, listener: () => void) =>
          listeners.get(event)?.delete(listener),
        api: {
          music: async (path: string) => {
            state.vampMusicCalls.push(path);
            return { data: { data: [] } };
          },
        },
      };
      state.MusicKit = {
        configure: async () => instance,
        getInstance: () => instance,
      };
    },
    { initial },
  );
}

async function setPlayback(page: Page, playback: TestPlayback) {
  await page.evaluate(
    (next) => (window as unknown as TestMusicWindow).setVampPlayback(next),
    playback,
  );
}

async function awaitPlaybackPoll(page: Page) {
  const reads = await page.evaluate(
    () => (window as unknown as TestMusicWindow).vampMusicReads,
  );
  await page.waitForFunction(
    (previous) =>
      (window as unknown as TestMusicWindow).vampMusicReads >= previous + 2,
    reads,
  );
}

async function dispatchVamp(page: Page) {
  await page.getByRole("button", { name: "Play Vamp", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Play Vamp" });
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as TestMusicWindow).vampLaunches,
    ),
  ).toEqual([]);
  await dialog
    .getByRole("button", { name: "Send Play Request", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("Apple Music request dispatched: Play Vamp", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as TestMusicWindow).vampLaunches,
    ),
  ).toEqual([
    { name: "Play Vamp", url: "shortcuts://run-shortcut?name=Play%20Vamp" },
  ]);
}

test("iPhone Vamp manual report stays separate from current MusicKit verification and saved history", async ({
  users,
}) => {
  const [user] = await users(1);
  const unrelated = {
    id: "111111",
    title: "Unrelated Track",
    artistName: "Test Artist",
    container: { id: "pl.other-playlist", type: "playlists" },
  };
  const approved = {
    id: "222222",
    title: "Approved Playlist Track",
    artistName: "Test Artist",
    container: { id: VAMP_PLAYLIST_ID, type: "playlists" },
  };
  await prepareMusic(user.page, { playing: false, item: unrelated });
  let llmRequests = 0;
  await user.page.route("**/api/ai/chat", (route) => {
    llmRequests++;
    return route.fulfill({
      status: 503,
      json: { error: "unexpected_llm_request" },
    });
  });
  await user.page.goto("/home");
  const card = user.page.getByRole("region", {
    name: "Now Playing",
    exact: true,
  });
  const provider = card.getByLabel("MusicKit playback status", {
    exact: true,
  });
  const reported = card.getByText("Reported playing: Vamp", { exact: true });
  const verified = card.getByText("Playing: Vamp", { exact: true });
  const manualHistory = user.page.getByText(
    "User reported playback started: Vamp",
    { exact: true },
  );
  const providerHistory = user.page.getByText(
    "MusicKit verified playback: Vamp",
    { exact: true },
  );
  await expect(provider).toHaveText("MusicKit: Paused — Unrelated Track");
  await dispatchVamp(user.page);
  await expect(
    card.getByText("Playback requested — awaiting confirmation", {
      exact: true,
    }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Confirm Playing", exact: true })
    .click();
  await expect(reported).toBeVisible();
  await expect(
    card.getByText("User-reported — not provider verified", { exact: true }),
  ).toBeVisible();
  await expect(manualHistory).toHaveCount(1);
  await expect(verified).toHaveCount(0);
  await expect(providerHistory).toHaveCount(0);

  await setPlayback(user.page, { playing: true, item: unrelated });
  await expect(provider).toHaveText("MusicKit: Playing — Unrelated Track");
  await expect(reported).toBeVisible();
  await expect(verified).toHaveCount(0);
  await setPlayback(user.page, { playing: false, item: approved });
  await expect(provider).toHaveText(
    "MusicKit: Paused — Approved Playlist Track",
  );
  await expect(reported).toBeVisible();
  await expect(providerHistory).toHaveCount(0);

  await setPlayback(user.page, { playing: true, item: approved });
  await expect(provider).toHaveText(
    "MusicKit: Playing — Approved Playlist Track",
  );
  await expect(verified).toBeVisible();
  await expect(
    card.getByText("MusicKit verified", { exact: true }),
  ).toBeVisible();
  await expect(reported).toHaveCount(0);
  await expect(manualHistory).toHaveCount(1);
  await expect(providerHistory).toHaveCount(1);
  const verificationTime = await providerHistory
    .locator("..")
    .locator("time")
    .getAttribute("datetime");
  expect(Number.isFinite(Date.parse(verificationTime ?? ""))).toBe(true);
  const readsBeforePolling = await user.page.evaluate(() => {
    const state = window as unknown as TestMusicWindow;
    const reads = state.vampMusicReads;
    state.emitVampPlayback();
    state.emitVampPlayback();
    return reads;
  });
  // Observe later interval reads as well as repeated SDK events: neither
  // should append a second verification entry for this dispatch.
  await user.page.waitForFunction(
    (reads) =>
      (window as unknown as TestMusicWindow).vampMusicReads >= reads + 16,
    readsBeforePolling,
  );
  await expect(providerHistory).toHaveCount(1);

  await setPlayback(user.page, { playing: true, item: unrelated });
  await expect(provider).toHaveText("MusicKit: Playing — Unrelated Track");
  await expect(reported).toBeVisible();
  await expect(verified).toHaveCount(0);
  await expect(
    card.getByText("User-reported — not provider verified", { exact: true }),
  ).toBeVisible();
  await expect(manualHistory).toHaveCount(1);
  await expect(providerHistory).toHaveCount(1);
  await setPlayback(user.page, { playing: false });
  await expect(provider).toHaveText("MusicKit: No active playback");
  await expect(reported).toBeVisible();
  await expect(verified).toHaveCount(0);
  expect(
    await user.page.evaluate(() => ({
      launches: (window as unknown as TestMusicWindow).vampLaunches,
      calls: (window as unknown as TestMusicWindow).vampMusicCalls,
    })),
  ).toEqual({
    launches: [
      { name: "Play Vamp", url: "shortcuts://run-shortcut?name=Play%20Vamp" },
    ],
    calls: [],
  });

  await setPlayback(user.page, { playing: false, item: approved });
  await user.page.reload();
  await expect(provider).toHaveText(
    "MusicKit: Paused — Approved Playlist Track",
  );
  await expect(reported).toBeVisible();
  await expect(verified).toHaveCount(0);
  await expect(
    card.getByText("MusicKit verified", { exact: true }),
  ).toHaveCount(0);
  await expect(manualHistory).toHaveCount(1);
  await expect(providerHistory).toHaveCount(1);
  expect(
    await user.page.evaluate(() => ({
      launches: (window as unknown as TestMusicWindow).vampLaunches,
      calls: (window as unknown as TestMusicWindow).vampMusicCalls,
    })),
  ).toEqual({ launches: [], calls: [] });
  expect(llmRequests).toBe(0);
});

test("iPhone Vamp title or missing playlist context cannot verify and a later match preserves Not Playing history", async ({
  users,
}) => {
  const [user] = await users(1);
  const titledVamp = {
    id: "333333",
    title: "Vamp",
    artistName: "Test Artist",
    container: { id: "pl.unrelated", type: "playlists" },
  };
  await prepareMusic(user.page, { playing: true, item: titledVamp });
  await user.page.goto("/home");
  const card = user.page.getByRole("region", {
    name: "Now Playing",
    exact: true,
  });
  const provider = card.getByLabel("MusicKit playback status", {
    exact: true,
  });
  const providerHistory = user.page.getByText(
    "MusicKit verified playback: Vamp",
    { exact: true },
  );
  await expect(provider).toHaveText("MusicKit: Playing — Vamp");
  await dispatchVamp(user.page);
  await awaitPlaybackPoll(user.page);
  await expect(
    card.getByText("Playback requested — awaiting confirmation", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(card.getByText("Playing: Vamp", { exact: true })).toHaveCount(0);
  await expect(providerHistory).toHaveCount(0);

  await setPlayback(user.page, {
    playing: true,
    item: { id: titledVamp.id, title: "Vamp", artistName: "Test Artist" },
  });
  await awaitPlaybackPoll(user.page);
  await expect(provider).toHaveText("MusicKit: Playing — Vamp");
  await expect(
    card.getByText("Playback requested — awaiting confirmation", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(card.getByText("Playing: Vamp", { exact: true })).toHaveCount(0);
  await expect(providerHistory).toHaveCount(0);
  await card.getByRole("button", { name: "Not Playing", exact: true }).click();
  const notPlayingHistory = user.page.getByText(
    "User reported playback did not start: Vamp",
    { exact: true },
  );
  await expect(
    card.getByText("Playback not confirmed", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("User-reported — not provider verified", { exact: true }),
  ).toBeVisible();
  await expect(notPlayingHistory).toHaveCount(1);

  await setPlayback(user.page, {
    playing: true,
    item: {
      id: titledVamp.id,
      title: "Approved Playlist Track",
      artistName: "Test Artist",
      container: { id: VAMP_PLAYLIST_ID, type: "playlists" },
    },
  });
  await expect(card.getByText("Playing: Vamp", { exact: true })).toBeVisible();
  await expect(
    card.getByText("MusicKit verified", { exact: true }),
  ).toBeVisible();
  await expect(provider).toHaveText(
    "MusicKit: Playing — Approved Playlist Track",
  );
  await expect(notPlayingHistory).toHaveCount(1);
  await expect(providerHistory).toHaveCount(1);
  await setPlayback(user.page, { playing: false });
  await expect(provider).toHaveText("MusicKit: No active playback");
  await expect(
    card.getByText("Playback not confirmed", { exact: true }),
  ).toBeVisible();
  await expect(card.getByText("Playing: Vamp", { exact: true })).toHaveCount(0);
  await expect(notPlayingHistory).toHaveCount(1);
  await expect(providerHistory).toHaveCount(1);
  expect(
    await user.page.evaluate(() => ({
      launches: (window as unknown as TestMusicWindow).vampLaunches,
      calls: (window as unknown as TestMusicWindow).vampMusicCalls,
    })),
  ).toEqual({
    launches: [
      { name: "Play Vamp", url: "shortcuts://run-shortcut?name=Play%20Vamp" },
    ],
    calls: [],
  });
});
