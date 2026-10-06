export const FISH_AUDIO_MODEL_ID = "s1";
export const FISH_AUDIO_REFERENCE_ID = "612b878b113047d9a770c069c8b4fdfe";
export const FISH_AUDIO_TIMEOUT_MS = 8000;

export type FishAudioFailureCategory =
  | "unauthorized"
  | "credits-required"
  | "forbidden"
  | "voice-not-found"
  | "rate-limited"
  | "timeout"
  | "provider-error"
  | "unavailable"
  | "invalid-response";

export interface FishAudioFailure {
  error: string;
  provider: "fish_audio";
  category: FishAudioFailureCategory;
  /** An actual upstream HTTP response, never the app's authentication status. */
  providerStatus?: number;
}

export type FishAudioResult =
  | { ok: true; response: Response }
  | { ok: false; failure: FishAudioFailure; status: 402 | 502 };

export function classifyFishAudioFailure(status: number): FishAudioFailure {
  const known: Record<number, [FishAudioFailureCategory, string]> = {
    401: ["unauthorized", "speech_access_denied"],
    402: ["credits-required", "speech_credits_required"],
    403: ["forbidden", "speech_access_denied"],
    404: ["voice-not-found", "speech_voice_not_found"],
    429: ["rate-limited", "speech_rate_limited"],
  };
  const [category, error] =
    known[status] ??
    (status >= 500 && status <= 599
      ? ["provider-error", "speech_provider_error"]
      : ["unavailable", "speech_unavailable"]);
  return {
    error,
    provider: "fish_audio",
    category,
    ...(Number.isInteger(status) && status >= 100 && status <= 599
      ? { providerStatus: status }
      : {}),
  };
}

/** Never log provider bodies, thrown messages, text, credentials, or headers. */
function logFailure(failure: FishAudioFailure, durationMs: number): void {
  console.warn(
    JSON.stringify({
      provider: "fish_audio",
      category: failure.category,
      ...(failure.providerStatus === undefined
        ? {}
        : { providerStatus: failure.providerStatus }),
      durationMs: Number.isFinite(durationMs)
        ? Math.max(0, Math.round(durationMs))
        : 0,
      modelId: FISH_AUDIO_MODEL_ID,
      referenceId: FISH_AUDIO_REFERENCE_ID,
      fallbackRequired: true,
    }),
  );
}

export function logFishAudioMissingKey(): void {
  console.warn(
    JSON.stringify({
      provider: "fish_audio",
      category: "missing-key",
      fallbackRequired: true,
    }),
  );
}

/** A single bounded server-side request; failures contain allowlisted fields. */
export async function requestFishAudio(
  text: string,
  apiKey: string,
  requestSignal?: AbortSignal,
): Promise<FishAudioResult> {
  const startedAt = performance.now();
  const timeoutSignal = AbortSignal.timeout(FISH_AUDIO_TIMEOUT_MS);
  const signal = requestSignal
    ? AbortSignal.any([timeoutSignal, requestSignal])
    : timeoutSignal;
  let providerStatus: number | undefined;
  const failed = (
    failure: FishAudioFailure,
    reportFailure = true,
  ): FishAudioResult => {
    if (reportFailure) logFailure(failure, performance.now() - startedAt);
    return {
      ok: false,
      failure,
      status: failure.category === "credits-required" ? 402 : 502,
    };
  };

  try {
    const response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: FISH_AUDIO_MODEL_ID,
        "User-Agent": "JARVIS/1.0",
      },
      body: JSON.stringify({
        text,
        reference_id: FISH_AUDIO_REFERENCE_ID,
        format: "mp3",
      }),
      signal,
    });
    providerStatus = response.status;
    if (!response.ok) {
      // Cancel without reading or forwarding any provider diagnostics.
      void response.body?.cancel().catch(() => {});
      return failed(classifyFishAudioFailure(response.status));
    }
    if (
      !response.body ||
      !response.headers.get("content-type")?.toLowerCase().startsWith("audio/")
    ) {
      void response.body?.cancel().catch(() => {});
      return failed({
        error: "speech_invalid_response",
        provider: "fish_audio",
        category: "invalid-response",
        providerStatus: response.status,
      });
    }
    // The browser also waits for a complete audio blob. Consume it here so
    // post-header timeouts and empty audio get the same sanitized diagnostics.
    const audio = await response.arrayBuffer();
    if (!audio.byteLength)
      return failed({
        error: "speech_invalid_response",
        provider: "fish_audio",
        category: "invalid-response",
        providerStatus: response.status,
      });
    return {
      ok: true,
      response: new Response(audio, {
        headers: { "Content-Type": "audio/mpeg" },
      }),
    };
  } catch (error) {
    const cancelledByClient =
      requestSignal?.aborted && signal.reason === requestSignal.reason;
    const timedOut =
      timeoutSignal.aborted ||
      (error instanceof Error && error.name === "TimeoutError");
    return failed(
      {
        error: timedOut ? "speech_timeout" : "speech_unavailable",
        provider: "fish_audio",
        category: timedOut ? "timeout" : "unavailable",
        ...(providerStatus === undefined ? {} : { providerStatus }),
      },
      !cancelledByClient,
    );
  }
}
