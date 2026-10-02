import { describe, it, expect } from "vitest";
import { usesOwnerGroq, groqPublicError, DEFAULT_GROQ_MODEL, groqRequestBody } from "./groq";
describe("Groq provider policy", () => {
  it("restricts owner billing to the verified owner", () => {
    const env = { LLM_MODE: "groq", OWNER_USER_ID: "owner" };
    expect(usesOwnerGroq(env, "owner")).toBe(true);
    expect(usesOwnerGroq(env, "other")).toBe(false);
    expect(usesOwnerGroq({ ...env, LLM_MODE: "deepspace" }, "owner")).toBe(
      false,
    );
  });
  it("never returns provider error bodies or credentials", () => {
    expect(
      groqPublicError({ statusCode: 403, message: "sensitive body" }),
    ).toContain("access was denied");
    expect(groqPublicError({ statusCode: 429 })).toContain("limiting");
    expect(groqPublicError({ message: "sensitive body" })).not.toContain(
      "sensitive",
    );
  });
  it("uses a tool-capable default model", () => {
    expect(DEFAULT_GROQ_MODEL).toBe("openai/gpt-oss-120b");
  });
});

it("removes unsupported reasoning while preserving tool continuations", () => {
  const call = { id: "call-1", type: "function", function: { name: "get_current_time", arguments: "{}" } };
  const messages = [
    { role: "user", content: "What time is it?" },
    { role: "assistant", content: null, reasoning_content: "private reasoning", tool_calls: [call] },
    { role: "tool", tool_call_id: "call-1", content: "12:00" },
  ];
  const result = JSON.parse(groqRequestBody(JSON.stringify({ messages, stream: true })));
  expect(result.messages[1]).not.toHaveProperty("reasoning_content");
  expect(result.messages[1].tool_calls).toEqual([call]);
  expect(result.messages[2]).toEqual(messages[2]);
  expect(result.stream).toBe(true);
});
