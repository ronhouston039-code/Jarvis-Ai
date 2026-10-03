/**
 * Multi-user collaboration spec — verifies two users sign in into
 * separate browser contexts and the app distinguishes them.
 *
 * `users(2)` takes any two accounts from your pool, so this spec passes on a
 * fresh app with no setup beyond having two test accounts:
 *   npx deepspace test accounts list
 *   npx deepspace test accounts create --email a@deepspace.test --name "A" --password-stdin
 *
 * Ask for accounts *by name* (`users(['Alice', 'Bob'])`) only when the
 * behaviour under test depends on which identity acts — otherwise naming them
 * couples the spec to one machine's pool.
 *
 * The `users` fixture handles sign-in caching (per-account storageState
 * persisted to `~/.deepspace/playwright-states/`), context creation, and
 * cleanup. No need to manage browser contexts manually.
 */
import { test, expect, loadAllTestAccounts } from "deepspace/testing";

// A machine that has never created test accounts is the normal state of a
// fresh checkout, and there `users()` throws — turning "you have no pool yet"
// into three red tests about the app, which it is not. Skip the file instead
// and say what creates the pool. The count is of accounts usable HERE: the
// pool is global per developer, but passwords live only on the machine that
// created the account.
const usableTestAccounts = loadAllTestAccounts().length;
test.skip(
  usableTestAccounts < 2,
  `Needs 2 usable test accounts, found ${usableTestAccounts}. Create them with ` +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" ' +
    "--password-stdin`, or fetch existing pool accounts with `npx deepspace test accounts recover --all`.",
);

test("each browser renders its own signed-in account", async ({ users }) => {
  const [a, b] = await users(2);

  // /home is dynamic (under src/pages/(app)/), so it mounts the nav shell;
  // '/' is the static landing and has no navigation.
  await Promise.all([a.page.goto("/home"), b.page.goto("/home")]);

  // Email, not name. The page renders the *session's* `name || email`, while
  // `user.name` here comes from the LOCAL account registry — and the two are
  // not the same fact: a display name is optional, and an account recovered on
  // another machine has none stored locally at all. The email is the credential
  // the context signed in with, so it is the one identity both sides agree on,
  // and asserting it proves the page is showing THIS browser's account.
  // The two accounts are distinct, so two exact matches is also the proof that
  // the contexts are not sharing one session.
  for (const user of [a, b]) {
    await expect(user.page.getByTestId("app-navigation")).toBeVisible({
      timeout: 15_000,
    });

    // The identity chip shows `name || email`. Its text is not predictable, but
    // its presence is: something must be there once the profile has loaded.
    // (It is `hidden sm:inline` in some templates, so assert text, not
    // visibility.)
    await expect(user.page.getByTestId("nav-user-name")).toHaveText(/\S/, {
      timeout: 15_000,
    });

    await user.page.getByRole("button", { name: "Account menu" }).click();
    await expect(user.page.getByTestId("nav-user-email")).toHaveText(
      user.email,
      {
        timeout: 15_000,
      },
    );
  }
});

test("API status page renders loading success and error states", async ({
  users,
}) => {
  const [user] = await users(1);
  let shouldFail = false;
  let requestCount = 0;

  await user.page.route("**/api/integrations", async (route) => {
    requestCount += 1;
    if (shouldFail) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "Catalog unavailable" }),
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { integrations: { openai: {}, wikipedia: {} } },
      }),
    });
  });

  await user.page.goto("/api-status");
  await expect(
    user.page.getByText("Loading integration catalog..."),
  ).toBeVisible();
  await expect(user.page.getByText("Integration catalog ready")).toBeVisible();
  await expect(user.page.getByText("2 integrations available.")).toBeVisible();

  shouldFail = true;
  await user.page.getByRole("button", { name: "Refresh" }).click();
  await expect(user.page.getByText("Catalog unavailable")).toBeVisible();
  await expect(
    user.page.getByText("Showing the last loaded catalog"),
  ).toBeVisible();
  await expect(user.page.getByText("Integration catalog ready")).toBeVisible();

  const urlAfterFailure = user.page.url();
  const requestsAfterFailure = requestCount;
  await user.page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure);
  expect(user.page.url()).toBe(urlAfterFailure);
});

test("API status page shows local retry after first-load API failure", async ({
  users,
}) => {
  const [user] = await users(1);
  let requestCount = 0;

  await user.page.route("**/api/integrations", async (route) => {
    requestCount += 1;
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ success: false, error: "Catalog unavailable" }),
    });
  });

  await user.page.goto("/api-status");
  await expect(
    user.page.getByText("Loading integration catalog..."),
  ).toBeVisible();
  await expect(user.page.getByText("Could not load API data")).toBeVisible();
  await expect(
    user.page.getByText("Retried 1 time automatically."),
  ).toBeVisible();

  const retryButton = user.page.getByRole("button", { name: "Retry" });
  await expect(retryButton).toBeVisible();

  const urlAfterFailure = user.page.url();
  const requestsAfterFailure = requestCount;
  await retryButton.click();
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure);
  expect(user.page.url()).toBe(urlAfterFailure);
});

test("private memory isolates users and deletion requires an action-bound confirmation", async ({
  users,
}) => {
  const [a, b] = await users(2);
  await Promise.all([a.page.goto("/personal"), b.page.goto("/personal")]);
  const content = `Private memory ${Date.now()}`;
  await a.page.getByRole("textbox", { name: "New memory" }).fill(content);
  await a.page
    .locator("form")
    .filter({ has: a.page.getByRole("textbox", { name: "New memory" }) })
    .getByRole("button", { name: "Remember", exact: true })
    .click();
  await expect(a.page.getByText(content, { exact: true })).toBeVisible();
  await expect(b.page.getByText(content, { exact: true })).toHaveCount(0);
  const card = a.page.locator(".personal-card").filter({ hasText: content });
  await card.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(a.page.getByRole("dialog")).toBeVisible();
  await expect(card).toBeVisible();
  await a.page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Delete", exact: true }).click();
  await a.page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(a.page.getByText(content, { exact: true })).toHaveCount(0);
});

test("iPhone keeps the full desktop dashboard with horizontal panning", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.setViewportSize({ width: 390, height: 844 });
  await a.page.goto("/home");
  await expect(
    a.page.getByRole("textbox", { name: "Message JARVIS" }),
  ).toBeVisible();
  await expect(
    a.page.getByRole("button", { name: "Start voice input" }),
  ).toBeVisible();
  expect(
    await a.page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    a.page.getByRole("button", { name: "Zoom dashboard", exact: true }),
  ).toBeVisible();
  await a.page.screenshot({
    path: "test-results/jarvis-mobile-overview.png",
    fullPage: true,
  });
  await a.page
    .getByRole("button", { name: "Zoom dashboard", exact: true })
    .click();
  const layout = await a.page.evaluate(() => {
    const viewport = document.querySelector(".hud-viewport");
    const dashboard = document.querySelector(".hud-dashboard");
    const support = document.querySelector(".hud-support");
    return {
      width: dashboard.getBoundingClientRect().width,
      scrollable: viewport.scrollWidth > viewport.clientWidth,
      supportVisible: getComputedStyle(support).display !== "none",
    };
  });
  expect(layout.width).toBeGreaterThanOrEqual(1280);
  expect(layout.scrollable).toBe(true);
  expect(layout.supportVisible).toBe(true);
  await a.page.getByRole("button", { name: "CHAT", exact: true }).click();
  await expect(a.page.getByText("Conversation channel open.")).toBeVisible();
  await a.page.getByRole("button", { name: "HOME", exact: true }).click();

  await a.page.screenshot({
    path: "test-results/jarvis-mobile.png",
    fullPage: true,
  });
});

test("holographic dashboard shows honest connection states and working navigation", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.setViewportSize({ width: 1440, height: 1000 });
  await a.page.goto("/home");
  await expect(a.page.locator(".hud-brand h1")).toHaveText("JARVIS");
  await expect(a.page.locator(".hud-reactor")).toBeVisible();
  await expect(a.page.locator(".hud-weather")).toContainText(
    "Tap to set location",
  );
  await expect(
    a.page.getByRole("link", { name: "SMART HOME", exact: true }),
  ).toHaveAttribute("href", "/connections?tab=home");
  await expect(a.page.getByText("GAMES", { exact: true })).toHaveCount(0);
  await expect(a.page.getByText("INTERNET", { exact: true })).toHaveCount(0);
  await expect(a.page.locator(".location-panel")).toContainText(
    "Location access is not enabled",
  );
  await a.page.screenshot({
    path: "test-results/jarvis-desktop.png",
    fullPage: true,
  });
  await a.page.getByRole("button", { name: "CHAT", exact: true }).click();
  await expect(a.page.getByText("Conversation channel open.")).toBeVisible();
  await a.page.getByRole("button", { name: "HOME", exact: true }).click();
  await expect(a.page.locator(".hud-reactor")).toBeVisible();
  await a.page.getByRole("link", { name: "PRODUCTIVITY", exact: true }).click();
  await expect(
    a.page.getByRole("heading", { name: "My space", exact: true }),
  ).toBeVisible();
});

test("streamed chat executes registered time tool and persists across reload", async ({
  users,
}) => {
  test.skip(
    process.env.JARVIS_TEST_AI !== "1",
    "Requires paid-provider boundary fixture; app internals stay real.",
  );
  const [a, b] = await users(2);
  const prompt = `Please get the current UTC time. ${Date.now()}`;
  await a.page.goto("/home");
  await b.page.goto("/home");
  await a.page.getByRole("textbox", { name: "Message JARVIS" }).fill(prompt);
  await a.page
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    a.page.getByText("The current time was retrieved successfully.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    b.page.getByText("The current time was retrieved successfully.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await a.page.reload();
  await a.page.locator(".history-item").first().click();
  await expect(
    a.page.getByText("The current time was retrieved successfully.", {
      exact: true,
    }),
  ).toBeVisible();
  await a.page.goto("/personal");
  const card = a.page
    .locator(".personal-card")
    .filter({ hasText: prompt })
    .first();
  await card.getByRole("button", { name: "Delete conversation" }).click();
  await a.page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(card).toHaveCount(0);
});

test("confirmation token cannot cross users or replay", async ({ users }) => {
  const [a, b] = await users(2);
  await Promise.all([a.page.goto("/home"), b.page.goto("/home")]);
  const call = async (page: typeof a.page, path: string, body: unknown) =>
    page.evaluate(
      async ({ path, body }) => {
        const modulePath = "/src/jarvis/client.ts";
        const module = await import(modulePath);
        const r = await module.authenticatedFetch(path, body);
        return { status: r.status, data: await r.json() };
      },
      { path, body },
    );
  const created = await call(a.page, "/api/jarvis/memories", {
    content: `__test-${Date.now()}__ token`,
    category: "preference",
  });
  expect(created.status).toBe(201);
  const recordId = created.data.data.record.recordId;
  const approval = await call(a.page, "/api/jarvis/confirmations/request", {
    collection: "memories",
    recordId,
  });
  expect(approval.status).toBe(200);
  expect(
    (
      await call(b.page, "/api/jarvis/confirmations/approve", {
        token: approval.data.token,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call(a.page, "/api/jarvis/confirmations/approve", {
        token: approval.data.token,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call(a.page, "/api/jarvis/confirmations/approve", {
        token: approval.data.token,
      })
    ).status,
  ).toBe(409);
});

test("scheduled reminders deliver a private notification", async ({
  users,
}) => {
  test.setTimeout(90000);
  const [a, b] = await users(2);
  await Promise.all([a.page.goto("/personal"), b.page.goto("/personal")]);
  const title = `__test-${Date.now()}__ due reminder`;
  const created = await a.page.evaluate(
    async ({ title }) => {
      const path = "/src/jarvis/client.ts";
      const module = await import(path);
      const result = await module.authenticatedFetch("/api/jarvis/reminders", {
        title,
        dueAt: new Date(Date.now() + 3000).toISOString(),
        timezone: "UTC",
      });
      return { status: result.status, data: await result.json() };
    },
    { title },
  );
  expect(created.status).toBe(201);
  await expect(
    a.page.locator(".personal-card").filter({ hasText: title }),
  ).toHaveCount(2, { timeout: 75000 });
  await expect(b.page.getByText(title, { exact: true })).toHaveCount(0);
  const reminder = a.page
    .locator(".personal-card")
    .filter({ hasText: title })
    .filter({
      has: a.page.getByRole("button", { name: "Delete", exact: true }),
    });
  await reminder.getByRole("button", { name: "Delete", exact: true }).click();
  await a.page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(reminder).toHaveCount(0);
});

test("other users cannot spend owner Groq or Fish credentials", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.goto("/home");
  const results = await a.page.evaluate(async () => {
    const path = "/src/jarvis/client.ts";
    const module = await import(path);
    const caps = await module.authenticatedFetch("/api/jarvis/capabilities");
    const voice = await module.authenticatedFetch("/api/tts", {
      text: "Do not bill the owner",
    });
    const greeting = await module.authenticatedFetch(
      "/api/jarvis/voice/greeting",
    );
    return {
      capabilities: await caps.json(),
      voiceStatus: voice.status,
      greetingStatus: greeting.status,
    };
  });
  expect(results.capabilities.llmMode).toBe("deepspace");
  expect(results.capabilities.fishVoice).toBe(false);
  expect(results.greetingStatus).toBe(403);
  expect(results.voiceStatus).toBe(403);
});

test("location and shortcut connections persist privately and reject cross-user edits", async ({
  users,
}) => {
  const [a, b] = await users(2);
  await a.page.goto("/connections?tab=location");
  await b.page.goto("/connections?tab=location");
  const label = `Private place ${Date.now()}`;
  await a.page.getByRole("textbox", { name: "Place name" }).fill(label);
  await a.page.getByRole("spinbutton", { name: "Latitude" }).fill("40.7");
  await a.page.getByRole("spinbutton", { name: "Longitude" }).fill("-74");
  await a.page
    .getByRole("button", { name: "Save location", exact: true })
    .click();
  await expect(a.page.getByRole("status")).toContainText("Saved.");
  await a.page.reload();
  await expect(a.page.getByRole("textbox", { name: "Place name" })).toHaveValue(
    label,
  );
  await expect(
    b.page.getByRole("textbox", { name: "Place name" }),
  ).not.toHaveValue(label);
  await a.page.goto("/connections?tab=home");
  const device = `Bedroom TV ${Date.now()}`;
  await a.page
    .getByRole("textbox", { name: "Device display name" })
    .fill(device);
  await a.page
    .getByRole("textbox", { name: "On shortcut name" })
    .fill("TV On & verify");
  await a.page
    .getByRole("textbox", { name: "Off shortcut name" })
    .fill("TV Off");
  const savedDeviceResponse = a.page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/jarvis/connections/devices") &&
      r.request().method() === "POST",
  );
  await a.page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  const savedDevice = await (await savedDeviceResponse).json();
  const recordId = savedDevice.data.record.recordId;
  await expect(
    a.page.getByRole("heading", { name: device, exact: true }),
  ).toBeVisible();
  await expect(
    a.page
      .locator(".personal-card")
      .filter({ hasText: device })
      .getByRole("link", { name: "Turn on", exact: true }),
  ).toHaveAttribute(
    "href",
    "shortcuts://run-shortcut?name=TV%20On%20%26%20verify",
  );
  await b.page.goto("/connections?tab=home");
  await expect(b.page.getByText(device, { exact: true })).toHaveCount(0);
  const refused = await b.page.evaluate(async (recordId) => {
    const module = await import("/src/jarvis/client.ts");
    const result = await module.authenticatedFetch(
      "/api/jarvis/connections/disable",
      { collection: "device-shortcuts", recordId },
    );
    return result.status;
  }, recordId);
  expect(refused).toBe(404);
  const id = await a.page.evaluate(async () => {
    const module = await import("/src/jarvis/client.ts");
    const response = await module.authenticatedFetch(
      "/api/jarvis/connections/location",
      {
        label: "Private edited location",
        latitude: 40,
        longitude: -74,
        enabled: 1,
      },
    );
    return response.status;
  });
  expect(id).toBe(200);
  await a.page.goto("/connections?tab=location");
  await a.page
    .getByRole("button", { name: "Clear saved location", exact: true })
    .click();
  await expect(
    a.page.getByRole("button", { name: "Clear saved location", exact: true }),
  ).toHaveCount(0);
  await a.page.goto("/connections?tab=home");
  await a.page
    .locator(".personal-card")
    .filter({ hasText: device })
    .getByRole("button", { name: "Remove connection", exact: true })
    .click();
  await expect(a.page.getByText(device, { exact: true })).toHaveCount(0);
});

test("security and live panels work and missing location is explained", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.goto("/connections?tab=security");
  await expect(
    a.page.getByText("Session: signed in", { exact: true }),
  ).toBeVisible();
  await a.page
    .getByRole("button", { name: "Check server connection", exact: true })
    .click();
  await expect(a.page.getByRole("status")).toContainText("server reachable");
  await a.page.goto("/connections?tab=location");
  if (
    await a.page
      .getByRole("button", { name: "Clear saved location", exact: true })
      .count()
  ) {
    await a.page
      .getByRole("button", { name: "Clear saved location", exact: true })
      .click();
    await expect(
      a.page.getByRole("button", { name: "Clear saved location", exact: true }),
    ).toHaveCount(0);
  }
  await a.page.goto("/connections?tab=live");
  await a.page
    .getByRole("button", { name: "Check live weather", exact: true })
    .click();
  await expect(a.page.getByRole("status")).toContainText(
    "Add your location first",
  );
});

test("Listen requests server Fish audio and falls back safely to device speech", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.addInitScript(() => {
    window.speechSynthesis.speak = (utterance) => {
      (window as unknown as { __spoken: string }).__spoken = utterance.text;
    };
  });
  await a.page.route("**/api/tts", (route) =>
    route.fulfill({
      status: 402,
      contentType: "application/json",
      body: JSON.stringify({ error: "speech_credits_required" }),
    }),
  );
  let fishRequests = 0;
  a.page.on("request", (r) => {
    if (r.url().endsWith("/api/tts")) fishRequests++;
  });
  await a.page.goto("/home");
  await a.page
    .getByRole("textbox", { name: "Message JARVIS" })
    .fill("Please get the current UTC time.");
  await a.page.getByRole("button", { name: "Send message" }).click();
  await expect(
    a.page.getByText("The current time was retrieved successfully.", {
      exact: true,
    }),
  ).toBeVisible();
  await a.page
    .getByRole("button", { name: "Read response aloud", exact: true })
    .last()
    .click();
  await expect
    .poll(() =>
      a.page.evaluate(
        () => (window as unknown as { __spoken: string }).__spoken,
      ),
    )
    .toContain("current time");
  expect(fishRequests).toBe(1);
});

test("voice activation speaks acknowledgement and each completed reply once", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.route("**/api/tts", (route) =>
    route.fulfill({ status: 502, contentType: "application/json", body: "{}" }),
  );
  await a.page.addInitScript(() => {
    window.speechSynthesis.speak = (utterance) => {
      const w = window as unknown as { __spoken: string[] };
      w.__spoken ??= [];
      w.__spoken.push(utterance.text);
    };
  });
  await a.page.goto("/home");
  await a.page
    .getByRole("button", { name: "Voice off · turn on", exact: true })
    .click();
  await expect(
    a.page.getByRole("button", { name: "Voice on · turn off", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await a.page
    .getByRole("textbox", { name: "Message JARVIS" })
    .fill("Please get the current UTC time.");
  await a.page.getByRole("button", { name: "Send message" }).click();
  await expect
    .poll(() =>
      a.page.evaluate(
        () => (window as unknown as { __spoken: string[] }).__spoken.length,
      ),
    )
    .toBe(2);
  const spoken = await a.page.evaluate(
    () => (window as unknown as { __spoken: string[] }).__spoken,
  );
  expect(spoken[0]).toContain("Voice enabled");
  expect(spoken[1]).toContain("current time");
  await a.page
    .getByRole("button", { name: "Voice on · turn off", exact: true })
    .click();
  await a.page.getByRole("button", { name: "HOME", exact: true }).click();
  await a.page.getByRole("button", { name: "CHAT", exact: true }).click();
  expect(
    await a.page.evaluate(
      () => (window as unknown as { __spoken: string[] }).__spoken.length,
    ),
  ).toBe(2);
});

test("Fish MP3 playback animates the orb and microphone cancels speech", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.addInitScript(() => {
    const w = window as unknown as {
      __paused: number;
      __listening: boolean;
      SpeechRecognition: unknown;
      Audio: unknown;
    };
    w.__paused = 0;
    w.Audio = class {
      playbackRate = 1;
      onended = null;
      onerror = null;
      play() {
        return Promise.resolve();
      }
      pause() {
        w.__paused++;
      }
    };
    w.SpeechRecognition = class {
      start() {
        w.__listening = true;
      }
      stop() {}
    };
  });
  await a.page.route("**/api/tts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "audio/mpeg",
      body: "ID3mock-audio",
    }),
  );
  await a.page.goto("/home");
  await a.page
    .getByRole("textbox", { name: "Message JARVIS" })
    .fill("Please get the current UTC time.");
  await a.page.getByRole("button", { name: "Send message" }).click();
  await expect(
    a.page.getByText("The current time was retrieved successfully.", {
      exact: true,
    }),
  ).toBeVisible();
  await a.page
    .getByRole("button", { name: "Read response aloud", exact: true })
    .last()
    .click();
  await expect(
    a.page.getByText("Jarvis is speaking…", { exact: true }),
  ).toBeVisible();
  await a.page.getByRole("button", { name: "HOME", exact: true }).click();
  await expect(a.page.locator(".jarvis-orb")).toHaveClass(/is-active/);
  await a.page
    .getByRole("button", { name: "Start voice input", exact: true })
    .click();
  await expect(
    a.page.getByText("Jarvis is speaking…", { exact: true }),
  ).toHaveCount(0);
  expect(
    await a.page.evaluate(
      () => (window as unknown as { __paused: number }).__paused,
    ),
  ).toBeGreaterThan(0);
  expect(
    await a.page.evaluate(
      () => (window as unknown as { __listening: boolean }).__listening,
    ),
  ).toBe(true);
});

test("Roku card reports offline and requires the exact power-off sheet", async ({
  users,
}) => {
  const [a] = await users(1);
  let approvals = 0;
  let cancellations = 0;
  await a.page.route("**/api/jarvis/connections/roku/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/status"))
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ online: false, error: "roku_offline" }),
      });
    if (path.endsWith("/power/request"))
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ token: "test-bound-token" }),
      });
    if (path.endsWith("/power/approve")) {
      approvals++;
      expect(route.request().postDataJSON()).toEqual({
        token: "test-bound-token",
      });
    }
    if (path.endsWith("/power/cancel")) cancellations++;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ accepted: true }),
    });
  });
  await a.page.goto("/connections?tab=home");
  const card = a.page.getByRole("region", {
    name: "TCL Roku TV connection",
    exact: true,
  });
  await card
    .getByRole("button", { name: "Test connection", exact: true })
    .click();
  await expect(card.getByText("Offline", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Turn off TV", exact: true }).click();
  const sheet = card.getByRole("dialog");
  await expect(
    sheet.getByText("Turn off TCL Roku TV now?", { exact: true }),
  ).toBeVisible();
  expect(approvals).toBe(0);
  await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(approvals).toBe(0);
  expect(cancellations).toBe(1);
  await card.getByRole("button", { name: "Turn off TV", exact: true }).click();
  await sheet.getByRole("button", { name: "Turn off TV", exact: true }).click();
  await expect(
    card.getByText("Power-off command accepted by TCL Roku TV.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(approvals).toBe(1);
});

test("Apple Music is unavailable without owner developer configuration", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.goto("/connections?tab=music");
  await expect(
    a.page.getByText("Direct Apple Music connection needs", { exact: false }),
  ).toBeVisible();
  await expect(
    a.page.getByRole("button", { name: "Connect Apple Music", exact: true }),
  ).toHaveCount(0);
  await expect(
    a.page.getByText("Connected to Apple Music", { exact: true }),
  ).toHaveCount(0);
});

test("MusicKit authorization requires consent and keeps listening context opt-in", async ({
  users,
}) => {
  const [a] = await users(1);
  await a.page.route("**/api/jarvis/connections/apple-music/config", (r) =>
    r.fulfill({
      json: {
        available: true,
        developerToken: "mock-musickit-developer-token",
      },
    }),
  );
  await a.page.addInitScript(() => {
    const w = window as unknown as {
      __appleCalls: string[];
      __deny: boolean;
      MusicKit: unknown;
    };
    w.__appleCalls = [];
    w.__deny = false;
    const instance = {
      isAuthorized: false,
      authorize: async () => {
        w.__appleCalls.push("authorize");
        if (w.__deny) throw new Error("mock cancellation");
        instance.isAuthorized = true;
        return "mock-user-token";
      },
      unauthorize: async () => {
        w.__appleCalls.push("disconnect");
        instance.isAuthorized = false;
      },
      pause: () => {},
      setQueue: async () => {},
      play: async () => {},
      api: {
        music: async (path: string) => {
          w.__appleCalls.push(path);
          if (path === "/v1/me/library/playlists")
            return { data: { data: [{ id: "mock-playlist-created" }] } };
          return { data: { data: [] } };
        },
      },
    };
    w.MusicKit = {
      configure: async () => instance,
      getInstance: () => instance,
    };
  });
  await a.page.goto("/connections?tab=music");
  await a.page
    .getByRole("button", { name: "Connect Apple Music", exact: true })
    .click();
  await expect(
    a.page.getByRole("dialog", { name: "Apple Music permissions" }),
  ).toBeVisible();
  await expect(
    a.page.getByRole("checkbox", {
      name: "Allow listening context in this browser",
    }),
  ).not.toBeChecked();
  expect(
    await a.page.evaluate(
      () => (window as unknown as { __appleCalls: string[] }).__appleCalls,
    ),
  ).toEqual([]);
  await a.page
    .getByRole("button", { name: "Continue with Apple Music", exact: true })
    .click();
  await expect(
    a.page.getByText("Connected to Apple Music", { exact: true }),
  ).toBeVisible();
  expect(
    await a.page.evaluate(
      () => (window as unknown as { __appleCalls: string[] }).__appleCalls,
    ),
  ).not.toContain("/v1/me/recent/played");
  await expect(
    a.page.getByRole("button", { name: "Show recently played", exact: true }),
  ).toHaveCount(0);
  await a.page
    .getByRole("checkbox", { name: "Allow listening context in this browser" })
    .check();
  await a.page
    .getByRole("button", { name: "Show recently played", exact: true })
    .click();
  await expect
    .poll(() =>
      a.page.evaluate(() =>
        (window as unknown as { __appleCalls: string[] }).__appleCalls.includes(
          "/v1/me/recent/played",
        ),
      ),
    )
    .toBe(true);
  await a.page
    .getByRole("button", { name: "New playlist", exact: true })
    .click();
  await expect(
    a.page.getByRole("dialog", { name: "Create playlist confirmation" }),
  ).toContainText("Songs: 0 initially");
  await a.page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await a.page.evaluate(
      () => (window as unknown as { __appleCalls: string[] }).__appleCalls,
    ),
  ).not.toContain("/v1/me/library/playlists");
  await a.page
    .getByRole("button", { name: "New playlist", exact: true })
    .click();
  await a.page
    .getByRole("textbox", { name: "Playlist name", exact: true })
    .fill("Saturday Night");
  await a.page
    .getByRole("button", { name: "Create playlist", exact: true })
    .click();
  await expect(
    a.page.getByText("Created playlist “Saturday Night” with 0 songs.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await a.page.evaluate(
      () =>
        (window as unknown as { __appleCalls: string[] }).__appleCalls.filter(
          (p) => p === "/v1/me/library/playlists",
        ).length,
    ),
  ).toBe(1);
  await a.page
    .getByRole("button", { name: "Disconnect Apple Music", exact: true })
    .click();
  await expect(
    a.page.getByText("Connected to Apple Music", { exact: true }),
  ).toHaveCount(0);
  await a.page.evaluate(
    () => ((window as unknown as { __deny: boolean }).__deny = true),
  );
  await a.page
    .getByRole("button", { name: "Connect Apple Music", exact: true })
    .click();
  await a.page
    .getByRole("button", { name: "Continue with Apple Music", exact: true })
    .click();
  await expect(
    a.page.getByText("Apple Music authorization did not complete.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    a.page.getByText("Connected to Apple Music", { exact: true }),
  ).toHaveCount(0);
});

test("weather permissions are explicit and approximate GPS is not saved automatically", async ({
  users,
}) => {
  const [a] = await users(1);
  let gpsCalls = 0;
  let savedLocations = 0;
  await a.page.addInitScript(() => {
    const w = window as unknown as { __gpsCalls: number };
    w.__gpsCalls = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (
          success: (position: {
            coords: { latitude: number; longitude: number };
          }) => void,
        ) => {
          w.__gpsCalls++;
          success({ coords: { latitude: 40.7128, longitude: -74.006 } });
        },
      },
    });
  });
  await a.page.route("**/api/weather?*", (r) => {
    const url = new URL(r.request().url());
    expect(url.searchParams.get("lat")).toBe("40.71");
    expect(url.searchParams.get("lon")).toBe("-74.01");
    gpsCalls++;
    return r.fulfill({
      json: {
        location: "Current location",
        approximate: true,
        temperature: 63,
        feelsLike: 61,
        description: "Partly cloudy",
        high: 67,
        low: 54,
        retrievedAt: new Date().toISOString(),
        source: "Mock weather boundary",
        forecast: [],
      },
    });
  });
  a.page.on("request", (r) => {
    if (r.url().endsWith("/connections/location") && r.method() === "POST")
      savedLocations++;
  });
  await a.page.goto("/connections?tab=location");
  await a.page
    .getByRole("button", { name: "Set weather location", exact: true })
    .click();
  await a.page.getByRole("button", { name: "Not now", exact: true }).click();
  expect(
    await a.page.evaluate(
      () => (window as unknown as { __gpsCalls: number }).__gpsCalls,
    ),
  ).toBe(0);
  await a.page
    .getByRole("button", { name: "Set weather location", exact: true })
    .click();
  await a.page
    .getByRole("button", { name: "Use current location", exact: true })
    .click();
  await expect(
    a.page.getByRole("heading", {
      name: "Current location · 63°F",
      exact: true,
    }),
  ).toBeVisible();
  expect(gpsCalls).toBe(1);
  expect(savedLocations).toBe(0);
});

// Quota exhaustion intentionally runs last so it cannot throttle other scenarios.
test("preferences persist and action quota returns 429", async ({ users }) => {
  const [a] = await users(1);
  await a.page.goto("/settings");
  await a.page.getByLabel("Your timezone").fill("America/New_York");
  await a.page.getByLabel("brief", { exact: true }).check();
  await a.page.getByRole("button", { name: "Save preferences" }).click();
  await expect(
    a.page.getByText("Preferences saved.", { exact: true }),
  ).toBeVisible();
  await a.page
    .getByLabel("Daily briefing", { exact: true })
    .selectOption("off");
  await a.page.getByLabel("Quiet hours start", { exact: true }).fill("23:00");
  await a.page
    .getByRole("button", { name: "Save proactive preferences", exact: true })
    .click();
  await expect(
    a.page.getByText(
      "Preferences saved. Scheduled proactive services are not active yet.",
      { exact: true },
    ),
  ).toBeVisible();
  await a.page.reload();
  await expect(
    a.page.getByLabel("Daily briefing", { exact: true }),
  ).toHaveValue("off");
  await expect(
    a.page.getByLabel("Quiet hours start", { exact: true }),
  ).toHaveValue("23:00");
  const statuses = await a.page.evaluate(async () => {
    const path = "/src/jarvis/client.ts";
    const module = await import(path);
    const statuses: number[] = [];
    for (let i = 0; i < 35; i++) {
      const r = await module.authenticatedFetch("/api/jarvis/memories", {});
      statuses.push(r.status);
      if (r.status === 429) break;
    }
    return statuses;
  });
  expect(statuses).toContain(429);
});
