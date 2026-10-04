import { describe, expect, it } from "vitest";
import { parseVampIntent } from "./vamp-intent";

describe("explicit Play Vamp user intents", () => {
  it("recognizes the exact playlist command with optional wake and politeness", () => {
    for (const text of [
      "play Vamp",
      "Jarvis, play Vamp",
      "Hey Jarvis, play Vamp.",
      "Jarvis please play Vamp",
      "Please, play Vamp",
      "Kindly play Vamp",
      "Play Vamp, please!",
      "  PLAY   VAMP  ",
    ])
      expect(parseVampIntent(text), text).toBe("play");
  });

  it("rejects questions, descriptions and quoted commands", () => {
    for (const text of [
      "Play Vamp?",
      "Can you play Vamp?",
      "Could you play Vamp",
      "How do I play Vamp",
      "What is Play Vamp",
      'He said "play Vamp"',
      '"Play Vamp"',
      "User: play Vamp",
      '{"playlist":"Vamp","action":"play"}',
    ])
      expect(parseVampIntent(text), text).toBeNull();
  });

  it("rejects negation, compounds, conditions and delayed playback", () => {
    for (const text of [
      "Don't play Vamp",
      "Do not play Vamp",
      "Never play Vamp",
      "Jarvis, please don't play Vamp",
      "Play Vamp and turn on the TV",
      "Play Vamp then pause",
      "Play Vamp if I get home",
      "If I am home, play Vamp",
      "Play Vamp in ten minutes",
      "Remind me to play Vamp",
      "Stop playing Vamp",
      "Pretend to play Vamp",
    ])
      expect(parseVampIntent(text), text).toBeNull();
  });

  it("rejects other playlists and malformed inputs", () => {
    for (const text of [
      "Play my playlist",
      "Play Vampire",
      "Play Vamp remix",
      "Jarvisplay Vamp",
      "Play Vamp\nPlay another playlist",
      "Play Vamp\u0000",
      "```Play Vamp```",
      "Please ".repeat(30) + "play Vamp",
      "",
    ])
      expect(parseVampIntent(text), text).toBeNull();
  });
});
