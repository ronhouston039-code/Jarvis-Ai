import { describe, expect, it } from "vitest";
import { spokenVersion } from "./jarvis-speech";
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
