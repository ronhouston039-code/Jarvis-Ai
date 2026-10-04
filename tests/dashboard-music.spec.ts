import { test, expect, loadAllTestAccounts } from "deepspace/testing";

test.skip(loadAllTestAccounts().length < 1, "Requires test account");

test("dashboard music shows setup requirements without invented playback", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.route("**/api/jarvis/connections/apple-music/config", (route) =>
    route.fulfill({ json: { available: false } }),
  );
  await a.page.goto("/home");
  const card = a.page.getByRole("region", { name: "Now Playing", exact: true });
  await expect(card).toContainText("Apple Music setup required");
  await expect(
    card.getByRole("link", { name: "Connect Apple Music" }),
  ).toHaveAttribute("href", "/connections?tab=music");
  await expect(card.getByRole("progressbar")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Pause music" })).toHaveCount(
    0,
  );
});

test("dashboard music reflects authorized SDK playback, propagates failures and disposes listeners", async ({
  users,
}) => {
  const [a] = await users(1);
  let configured = true;
  await a.page.route("**/api/jarvis/connections/apple-music/config", (route) =>
    route.fulfill({
      json: configured
        ? { available: true, developerToken: "mock-public-developer-token" }
        : { available: false },
    }),
  );
  await a.page.addInitScript(() => {
    const w = window as unknown as {
      MusicKit: unknown;
      __musicCalls: string[];
      __musicFail: boolean;
      __musicListenerCount: () => number;
    };
    w.__musicCalls = [];
    w.__musicFail = false;
    const listeners = new Map<string, Set<() => void>>();
    const emit = (event: string) =>
      listeners.get(event)?.forEach((listener) => listener());
    const instance = {
      isAuthorized: true,
      isPlaying: true,
      nowPlayingItem: { title: "Test Track", artistName: "Test Artist" },
      currentPlaybackTime: 84,
      currentPlaybackDuration: 258,
      authorize: async () => {
        w.__musicCalls.push("authorize");
        return "unused-test-user-token";
      },
      unauthorize: async () => {
        instance.isAuthorized = false;
        emit("authorizationStatusDidChange");
      },
      setQueue: async () => {
        w.__musicCalls.push("setQueue");
      },
      play: async () => {
        w.__musicCalls.push("play");
        if (w.__musicFail) throw new Error("mock subscription failure");
        instance.isPlaying = true;
        emit("playbackStateDidChange");
      },
      pause: () => {
        w.__musicCalls.push("pause");
        instance.isPlaying = false;
        emit("playbackStateDidChange");
      },
      skipToNextItem: async () => {
        w.__musicCalls.push("next");
        instance.nowPlayingItem = {
          title: "Second Track",
          artistName: "Test Artist",
        };
        instance.currentPlaybackTime = 0;
        emit("nowPlayingItemDidChange");
      },
      skipToPreviousItem: async () => {
        w.__musicCalls.push("previous");
      },
      addEventListener: (event: string, listener: () => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(listener);
      },
      removeEventListener: (event: string, listener: () => void) =>
        listeners.get(event)?.delete(listener),
      api: {
        music: async (path: string) => {
          w.__musicCalls.push(path);
          return { data: { data: [] } };
        },
      },
    };
    w.__musicListenerCount = () =>
      [...listeners.values()].reduce((count, set) => count + set.size, 0);
    w.MusicKit = {
      configure: async () => instance,
      getInstance: () => instance,
    };
  });
  await a.page.goto("/home");
  const card = a.page.getByRole("region", { name: "Now Playing", exact: true });
  await expect(card).toContainText("Test Track");
  await expect(card).toContainText("Test Artist");
  await expect(
    card.getByRole("progressbar", { name: "Track progress" }),
  ).toHaveAttribute("value", "84");
  await expect(card.getByRole("progressbar")).toHaveAttribute("max", "258");
  await card.getByRole("button", { name: "Pause music", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Play music", exact: true }),
  ).toBeVisible();
  await a.page.evaluate(() => {
    (window as unknown as { __musicFail: boolean }).__musicFail = true;
  });
  await card.getByRole("button", { name: "Play music", exact: true }).click();
  await expect(card.getByRole("status")).toContainText(
    "could not complete that command",
  );
  await expect(
    card.getByRole("button", { name: "Play music", exact: true }),
  ).toBeVisible();
  await a.page.evaluate(() => {
    (window as unknown as { __musicFail: boolean }).__musicFail = false;
  });
  await card.getByRole("button", { name: "Play music", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Pause music", exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Next track", exact: true }).click();
  await expect(card).toContainText("Second Track");
  await expect(card.getByRole("progressbar")).toHaveAttribute("value", "0");
  const calls = await a.page.evaluate(
    () => (window as unknown as { __musicCalls: string[] }).__musicCalls,
  );
  expect(calls).toEqual(["pause", "play", "play", "next"]);
  await expect
    .poll(() =>
      a.page.evaluate(() =>
        (
          window as unknown as { __musicListenerCount: () => number }
        ).__musicListenerCount(),
      ),
    )
    .toBe(4);
  configured = false;
  await card.getByRole("button", { name: "Pause music", exact: true }).click();
  await expect(card).toContainText("Apple Music setup required");
  await expect(card).not.toContainText("Second Track");
  await expect(
    card.getByRole("button", { name: "Pause music", exact: true }),
  ).toHaveCount(0);
  expect(
    await a.page.evaluate(
      () => (window as unknown as { __musicCalls: string[] }).__musicCalls,
    ),
  ).toEqual(["pause", "play", "play", "next"]);
  await expect
    .poll(() =>
      a.page.evaluate(() =>
        (
          window as unknown as { __musicListenerCount: () => number }
        ).__musicListenerCount(),
      ),
    )
    .toBe(0);
  await a.page
    .getByRole("link", { name: "Settings", exact: true })
    .first()
    .click();
  await expect
    .poll(() =>
      a.page.evaluate(() =>
        (
          window as unknown as { __musicListenerCount: () => number }
        ).__musicListenerCount(),
      ),
    )
    .toBe(0);
});
