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

export const DEFAULT_SETTINGS_TIMEZONE = "America/New_York";
export const temperatureUnitSchema = z.enum(["fahrenheit", "celsius"]);
export type TemperatureUnit = z.infer<typeof temperatureUnitSchema>;
export const DEFAULT_TEMPERATURE_UNIT: TemperatureUnit = "fahrenheit";
export function resolveTemperatureUnit(value: unknown): TemperatureUnit {
  const parsed = temperatureUnitSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_TEMPERATURE_UNIT;
}

const proactiveSchema = z
  .object({
    dailyBriefing: z.boolean(),
    calendarAlerts: z.boolean(),
    weatherAlerts: z.boolean(),
    focusBlocks: z.enum(["ask", "off"]),
    emailReminders: z.boolean(),
    marketing: z.boolean(),
    quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict();

/** Partial updates preserve unrelated saved settings in the existing record. */
export const preferencesPatchSchema = z
  .object({
    timezone: zoneSchema.optional(),
    responseMode: z.enum(["normal", "brief", "technical"]).optional(),
    temperatureUnit: temperatureUnitSchema.optional(),
    liveWebSearch: z.boolean().optional(),
    proactive: z
      .string()
      .max(1000)
      .refine((value) => {
        try {
          return proactiveSchema.safeParse(JSON.parse(value)).success;
        } catch {
          return false;
        }
      })
      .optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined));
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
