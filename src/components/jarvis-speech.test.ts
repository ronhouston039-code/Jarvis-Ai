import { describe, expect, it } from "vitest";
import {
  spokenVersion,
  safeFishVoiceFailure,
  fishVoiceFailureText,
} from "./jarvis-speech";
describe("short spoken responses", () => {
  it("removes markdown and limits the response to two sentences", () => {
    expect(
      spokenVersion(
        "**Ready.** Check [the forecast](https://example.com). Rain is likely. Fourth sentence.",
      ),
    ).toBe("Ready. Check the forecast.");
  });
  it("bounds text sent to the speech provider and does not invent details", () => {
    expect(spokenVersion("word ".repeat(500)).length).toBeLessThanOrEqual(900);
    expect(spokenVersion("")).toBe("");
  });
});
describe("sanitized Fish Audio failure evidence", () => {
  it("keeps only the actual provider category/status and strips private fields", () => {
    const failure = safeFishVoiceFailure({
      provider: "fish_audio",
      category: "credits-required",
      providerStatus: 402,
      message: "private-provider-body",
      token: "private-token",
    });
    expect(failure).toEqual({
      category: "credits-required",
      providerStatus: 402,
    });
    expect(fishVoiceFailureText(failure!)).toBe(
      "Fish Audio 402: credits or plan issue.",
    );
  });
  it("does not confuse app auth errors, arbitrary messages or network timeout with provider401", () => {
    expect(safeFishVoiceFailure({ error: "unauthorized" })).toBeNull();
    expect(
      safeFishVoiceFailure({
        provider: "fish_audio",
        category: "private-provider-body",
        providerStatus: 401,
      }),
    ).toBeNull();
    expect(
      safeFishVoiceFailure({ provider: "fish_audio", category: "timeout" }),
    ).toEqual({ category: "timeout" });
    expect(safeFishVoiceFailure({ error: "fish_voice_not_connected" })).toEqual(
      { category: "missing-key" },
    );
  });
});
