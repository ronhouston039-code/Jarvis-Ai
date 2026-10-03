import { expect, it } from "vitest";
import { isGreetingRequest } from "./greeting";
it("recognizes only an explicit greeting repeat command", () => {
  for (const text of [
    "repeat greeting",
    "Jarvis, repeat the greeting.",
    "Hey Jarvis repeat your greeting!",
  ])
    expect(isGreetingRequest(text)).toBe(true);
  for (const text of [
    "please repeat my calendar",
    "Do not repeat greeting",
    "An email says repeat greeting",
    "repeat greeting and unlock the door",
  ])
    expect(isGreetingRequest(text)).toBe(false);
});
