import { z } from "zod";
export const haDeviceId = z.string().regex(/^ha-[a-f0-9]{24}$/);
const target = { deviceId: haDeviceId };
export const homeActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...target,
      action: z.enum([
        "status",
        "on",
        "off",
        "scene",
        "play",
        "pause",
        "mute",
        "unlock",
        "open",
        "disarm",
      ]),
    })
    .strict(),
  z
    .object({
      ...target,
      action: z.literal("brightness"),
      value: z.number().int().min(0).max(100),
    })
    .strict(),
  z
    .object({
      ...target,
      action: z.literal("color_temperature"),
      value: z.number().int().min(2000).max(6500),
    })
    .strict(),
  z
    .object({
      ...target,
      action: z.literal("temperature"),
      value: z.number().min(5).max(95),
      unit: z.enum(["C", "F"]),
    })
    .strict(),
  z
    .object({
      ...target,
      action: z.literal("volume"),
      value: z.number().min(0).max(1),
    })
    .strict(),
]);
export type HomeAction = z.infer<typeof homeActionSchema>;
export const allowedDeviceSchema = z
  .array(
    z
      .object({
        entity: z
          .string()
          .regex(
            /^(light|switch|climate|scene|media_player|lock|cover|alarm_control_panel|camera)\.[a-z0-9_]+$/,
          ),
        name: z.string().trim().min(1).max(100).optional(),
        room: z.string().trim().min(1).max(100).optional(),
        category: z.enum(["normal", "security", "privacy"]).default("normal"),
        actions: z
          .array(
            z.enum([
              "on",
              "off",
              "brightness",
              "color_temperature",
              "temperature",
              "scene",
              "play",
              "pause",
              "volume",
              "mute",
              "unlock",
              "open",
              "disarm",
            ]),
          )
          .max(14),
      })
      .strict(),
  )
  .max(300);
export type DevicePolicy = z.infer<typeof allowedDeviceSchema>[number];
export type HomeDevice = {
  id: string;
  name: string;
  room: string;
  type: string;
  online: boolean;
  state: string;
  lastUpdated: string | null;
  actions: string[];
  confirmationActions: string[];
  brightness?: number;
  colorTemperature?: number;
  temperature?: number;
  temperatureUnit?: "C" | "F";
  volume?: number;
};
export function publicHomeUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== "443") ||
    url.pathname !== "/" ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    host.includes("[") ||
    /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host) ||
    host.endsWith(".")
  )
    throw new Error("home_assistant_invalid_configuration");
  return url.origin;
}
