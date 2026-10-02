import { describe, it, expect } from "vitest";
import {
  memorySchema,
  reminderSchema,
  deletionSchema,
  zoneSchema,
} from "./contracts";
import { aiChatSchemas } from "../schemas/ai-chat-schema";
import { personalSchemas } from "../schemas/personal";
import { buildTools, buildSystemPrompt } from "../ai/tools";
describe("JARVIS security contracts", () => {
  it('denies raw reminder and memory creates and updates',()=>{for(const schema of personalSchemas.filter(s=>['reminders','memories'].includes(s.name)))for(const role of ['admin','member','viewer']){expect(schema.permissions[role].create).toBe(false);expect(schema.permissions[role].update).toBe(false)}});
  it("requires exact validated deletion actions", () => {
    expect(
      deletionSchema.safeParse({ collection: "users", recordId: "a" }).success,
    ).toBe(false);
    expect(
      deletionSchema.safeParse({
        collection: "memories",
        recordId: "a",
        userId: "other",
      }).success,
    ).toBe(false);
  });
  it("rejects past reminders and invalid timezones", () => {
    expect(zoneSchema.safeParse("not/a/zone").success).toBe(false);
    expect(
      reminderSchema.safeParse({
        title: "Call doctor",
        dueAt: "2020-01-01T00:00:00Z",
        timezone: "UTC",
      }).success,
    ).toBe(false);
  });
  it("does not accept caller identity in memory writes", () => {
    expect(
      memorySchema.safeParse({ content: "Useful", userId: "other" }).success,
    ).toBe(false);
  });
  it("makes conversations private and immutable across every role", () => {
    for (const schema of aiChatSchemas)
      for (const role of ["admin", "member", "viewer"]) {
        expect(schema.permissions?.[role]).toEqual({
          read: "own",
          create: false,
          update: false,
          delete: false,
        });
      }
  });
  it("forbids direct destructive personal mutations", () => {
    for (const schema of personalSchemas)
      for (const role of ["admin", "member", "viewer"])
        expect(schema.permissions?.[role].delete).toBe(false);
  });
  it("only publishes explicit safe tools", () => {
    const tools = buildTools(async () => ({
      success: true,
      data: { records: [] },
    }));
    expect(Object.keys(tools)).not.toContain("records.delete");
    expect(Object.keys(tools)).not.toContain("send_email");
    expect(buildSystemPrompt("JARVIS", [])).toContain("UNTRUSTED");
  });
});
