import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppContext, Env } from "../../worker";
import {
  FISH_AUDIO_MODEL_ID,
  FISH_AUDIO_REFERENCE_ID,
  FISH_AUDIO_TIMEOUT_MS,
  classifyFishAudioFailure,
  requestFishAudio,
} from "./fish-audio";

const auth = vi.hoisted(() => vi.fn());
vi.mock("../server/http-routes", () => ({
  resolveAuth: auth,
  resolveAgentAuth: auth,
}));
vi.mock("deepspace/worker", () => ({
  resolveAppMembership: vi.fn(),
  createUserToolExecutor: vi.fn(),
}));
vi.mock("./connection-routes", () => ({ registerConnectionRoutes: vi.fn() }));
import { registerJarvisRoutes } from "./routes";

const fakeKey = "mock-server-only-secret";
const providerBody = `private provider diagnostics Bearer ${fakeKey}`;
const categories = [
  [401, "unauthorized", "speech_access_denied", 502],
  [402, "credits-required", "speech_credits_required", 402],
  [403, "forbidden", "speech_access_denied", 502],
  [404, "voice-not-found", "speech_voice_not_found", 502],
  [429, "rate-limited", "speech_rate_limited", 502],
  [500, "provider-error", "speech_provider_error", 502],
  [503, "provider-error", "speech_provider_error", 502],
  [599, "provider-error", "speech_provider_error", 502],
  [400, "unavailable", "speech_unavailable", 502],
] as const;

beforeEach(() => {
  auth.mockReset().mockResolvedValue({ userId: "owner" });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function appEnvironment(changes: Partial<Env> = {}): Env {
  return {
    OWNER_USER_ID: "owner",
    DEEPSPACE_APP_ID: "app-test",
    FISH_AUDIO_API_KEY: fakeKey,
    CONFIRMATIONS: {
      idFromName: () => "test-id",
      get: () => ({ fetch: async () => Response.json({ allowed: true }) }),
    },
    ...changes,
  } as unknown as Env;
}

function tts(
  environment = appEnvironment(),
  body: unknown = { text: "Hello, Sir." },
  path = "/api/tts",
) {
  const app = new Hono<AppContext>();
  registerJarvisRoutes(app);
  return app.request(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    environment,
  );
}

describe("sanitized Fish Audio provider failures", () => {
  it.each(categories)(
    "classifies upstream HTTP %i without forwarding its body",
    async (status, category, error, routeStatus) => {
      const fetchProvider = vi
        .fn()
        .mockResolvedValue(new Response(providerBody, { status }));
      vi.stubGlobal("fetch", fetchProvider);
      const response = await tts();
      expect(response.status).toBe(routeStatus);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({
        error,
        provider: "fish_audio",
        category,
        providerStatus: status,
      });
      expect(fetchProvider).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(vi.mocked(console.warn).mock.calls[0][0]);
      expect(logged).toEqual({
        provider: "fish_audio",
        category,
        providerStatus: status,
        durationMs: expect.any(Number),
        modelId: FISH_AUDIO_MODEL_ID,
        referenceId: FISH_AUDIO_REFERENCE_ID,
        fallbackRequired: true,
      });
      expect(logged.durationMs).toBeGreaterThanOrEqual(0);
      expect(JSON.stringify(logged)).not.toContain(fakeKey);
      expect(JSON.stringify(logged)).not.toContain(
        "private provider diagnostics",
      );
      expect(JSON.stringify(logged)).not.toContain("Hello, Sir.");
    },
  );

  it("keeps invalid status numbers out of public diagnostics", () => {
    for (const status of [0, -1, 1000, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(classifyFishAudioFailure(status)).toEqual({
        provider: "fish_audio",
        error: "speech_unavailable",
        category: "unavailable",
      });
    }
  });

  it("bounds a stalled request and categorizes a timeout without its message", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException(providerBody, "TimeoutError")),
    );
    const response = await tts();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "speech_timeout",
      provider: "fish_audio",
      category: "timeout",
    });
    expect(timeout).toHaveBeenCalledWith(FISH_AUDIO_TIMEOUT_MS);
    expect(FISH_AUDIO_TIMEOUT_MS).toBeLessThanOrEqual(8000);
    const logged = JSON.parse(vi.mocked(console.warn).mock.calls[0][0]);
    expect(logged.category).toBe("timeout");
    expect(logged).not.toHaveProperty("providerStatus");
    expect(JSON.stringify(logged)).not.toContain(fakeKey);
    expect(JSON.stringify(logged)).not.toContain(
      "private provider diagnostics",
    );
  });

  it("categorizes network failures without reading thrown diagnostics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(providerBody)));
    const result = await requestFishAudio("Private spoken text", fakeKey);
    expect(result).toEqual({
      ok: false,
      status: 502,
      failure: {
        error: "speech_unavailable",
        provider: "fish_audio",
        category: "unavailable",
      },
    });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      fakeKey,
    );
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "Private spoken text",
    );
  });

  it("categorizes an audio body timeout after successful headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new DOMException(providerBody, "TimeoutError"));
            },
          }),
          { headers: { "Content-Type": "audio/mpeg" } },
        ),
      ),
    );
    const response = await tts();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "speech_timeout",
      provider: "fish_audio",
      category: "timeout",
      providerStatus: 200,
    });
    const logged = JSON.parse(vi.mocked(console.warn).mock.calls[0][0]);
    expect(logged).toMatchObject({
      category: "timeout",
      providerStatus: 200,
      fallbackRequired: true,
    });
    expect(JSON.stringify(logged)).not.toContain(fakeKey);
  });

  it("rejects empty successful audio before presenting playback success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array(), {
          headers: { "Content-Type": "audio/mpeg" },
        }),
      ),
    );
    const response = await tts();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "speech_invalid_response",
      provider: "fish_audio",
      category: "invalid-response",
      providerStatus: 200,
    });
  });

  it("passes client cancellation into the provider request", async () => {
    const request = new AbortController();
    const fetchProvider = vi.fn(async (_url, init) => {
      const signal: AbortSignal = init.signal;
      request.abort(new DOMException(providerBody, "AbortError"));
      expect(signal.aborted).toBe(true);
      throw signal.reason;
    });
    vi.stubGlobal("fetch", fetchProvider);
    const result = await requestFishAudio("Hello", fakeKey, request.signal);
    expect(result).toMatchObject({
      ok: false,
      failure: { category: "unavailable" },
    });
    expect(JSON.stringify(result)).not.toContain(providerBody);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("still logs a real timeout when the client cancels afterward", async () => {
    const client = new AbortController();
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        timeout.abort(new DOMException(providerBody, "TimeoutError"));
        client.abort(new DOMException(providerBody, "AbortError"));
        throw init.signal.reason;
      }),
    );
    const result = await requestFishAudio("Hello", fakeKey, client.signal);
    expect(result).toMatchObject({
      ok: false,
      failure: { category: "timeout" },
    });
    expect(JSON.parse(vi.mocked(console.warn).mock.calls[0][0]).category).toBe(
      "timeout",
    );
  });

  it.each(["application/json", "text/html", ""])(
    "does not forward a successful non-audio %s provider body",
    async (type) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(providerBody, {
            status: 200,
            headers: type ? { "Content-Type": type } : {},
          }),
        ),
      );
      const response = await tts();
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: "speech_invalid_response",
        provider: "fish_audio",
        category: "invalid-response",
        providerStatus: 200,
      });
    },
  );
});

describe("Fish Audio route authorization and success", () => {
  it("keeps app authentication HTTP401 separate from provider HTTP401", async () => {
    auth.mockResolvedValue(null);
    const fetchProvider = vi.fn();
    vi.stubGlobal("fetch", fetchProvider);
    const response = await tts();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(fetchProvider).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("retains the owner-only provider billing boundary", async () => {
    auth.mockResolvedValue({ userId: "another-user" });
    const fetchProvider = vi.fn();
    vi.stubGlobal("fetch", fetchProvider);
    const response = await tts();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "owner_voice_only" });
    expect(fetchProvider).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not rename or expose the configured server credential", async () => {
    const fetchProvider = vi.fn();
    vi.stubGlobal("fetch", fetchProvider);
    const response = await tts(
      appEnvironment({ FISH_AUDIO_API_KEY: undefined }),
    );
    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "fish_voice_not_connected",
    });
    expect(fetchProvider).not.toHaveBeenCalled();
    expect(JSON.parse(vi.mocked(console.warn).mock.calls[0][0])).toEqual({
      provider: "fish_audio",
      category: "missing-key",
      fallbackRequired: true,
    });
  });

  it("rejects invalid text before requesting the provider", async () => {
    const fetchProvider = vi.fn();
    vi.stubGlobal("fetch", fetchProvider);
    const response = await tts(appEnvironment(), {
      text: " ",
      secret: fakeKey,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_fields" });
    expect(fetchProvider).not.toHaveBeenCalled();
  });

  it.each(["/api/tts", "/api/jarvis/voice/speak"])(
    "preserves audio playback and server-only authorization for %s",
    async (path) => {
      const fetchProvider = vi.fn().mockResolvedValue(
        new Response("mock-audio-bytes", {
          headers: { "Content-Type": "audio/mpeg" },
        }),
      );
      vi.stubGlobal("fetch", fetchProvider);
      const response = await tts(
        appEnvironment(),
        { text: "  Hello, Sir.  " },
        path,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Authorization")).toBeNull();
      expect(await response.text()).toBe("mock-audio-bytes");
      const [url, request] = fetchProvider.mock.calls[0];
      expect(url).toBe("https://api.fish.audio/v1/tts");
      expect(request.headers.Authorization).toBe(`Bearer ${fakeKey}`);
      expect(request.headers.model).toBe(FISH_AUDIO_MODEL_ID);
      expect(JSON.parse(request.body)).toEqual({
        text: "Hello, Sir.",
        reference_id: FISH_AUDIO_REFERENCE_ID,
        format: "mp3",
      });
      expect(console.warn).not.toHaveBeenCalled();
    },
  );
});
