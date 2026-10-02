import { z } from "zod";

export const zoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Use a valid IANA timezone");
export const reminderSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    dueAt: z.iso
      .datetime({ offset: true })
      .refine(
        (value) => Date.parse(value) > Date.now(),
        "Choose a future time",
      ),
    timezone: zoneSchema,
  })
  .strict();
export const memorySchema = z
  .object({
    content: z.string().trim().min(1).max(2000),
    category: z.string().max(60).default("preference"),
  })
  .strict();
export const deletionSchema = z
  .object({
    collection: z.enum(["memories", "reminders", "ai-chats"]),
    recordId: z.string().min(1).max(200),
  })
  .strict();
export type Reminder = {
  userId: string;
  title: string;
  dueAt: string;
  timezone: string;
  status: string;
};
export type Memory = { userId: string; content: string; category: string };
export type Notification = {
  userId: string;
  reminderId: string;
  title: string;
  message: string;
  read: number;
};
export type Stored<T> = {
  recordId: string;
  data: T;
  createdAt: string;
  updatedAt: string;
};
export function untrusted(result: unknown) {
  return { untrusted_data: result };
}
