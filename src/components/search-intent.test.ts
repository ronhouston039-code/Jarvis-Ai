import { expect, it } from "vitest";
import { searchIntent } from "./search-intent";
it("routes public factual, historical and current research questions", () => {
  for (const text of ["Who invented the telephone?", "Jarvis, look up the latest space news", "When was Rome founded?", "What is quantum computing?", "Search the web for solar panels"]) expect(searchIntent(text)).toBeTruthy();
});
it("never routes casual chat, private information or device commands to Tavily", () => {
  for (const text of ["How are you?", "Hello", "Play Vamp", "Turn off the TV", "Find my email", "What's on my calendar?", "What's the weather?", "Buy a laptop", "What is my password?", "Research api key=private-token"]) expect(searchIntent(text)).toBeNull();
});
