import { describe, it, expect } from "vitest";
import { usableAppleMusicToken } from "./apple-music-config";
const encoded = (data: unknown) =>
  btoa(JSON.stringify(data))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
describe("MusicKit developer configuration", () => {
  it("never treats a signing key, missing token or expired JWT as browser configuration", () => {
    expect(usableAppleMusicToken(undefined)).toBe(false);
    expect(usableAppleMusicToken("-----BEGIN PRIVATE KEY-----")).toBe(false);
    expect(
      usableAppleMusicToken(
        `${encoded({ alg: "ES256" })}.${encoded({ iss: "test-team", exp: 1 })}.testsignature`,
      ),
    ).toBe(false);
  });
  it("requires the documented signing algorithm and a future expiration", () => {
    const payload = encoded({ iss: "test-team", exp: Date.now() / 1000 + 60 });
    expect(
      usableAppleMusicToken(
        `${encoded({ alg: "ES256" })}.${payload}.testsignature`,
      ),
    ).toBe(true);
    expect(
      usableAppleMusicToken(
        `${encoded({ alg: "none" })}.${payload}.testsignature`,
      ),
    ).toBe(false);
  });
});
