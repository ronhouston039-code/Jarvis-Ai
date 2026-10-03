import { z } from "zod";
// Reject private material rather than persisting a redacted copy of a raw payload.
const privateMaterial =
  /https?:\/\/|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b|\b\d{3}-\d{2}-\d{3}\b|\b(?:light|switch|climate|scene|media_player|lock|cover|camera)\.[a-z0-9_]+\b|[\u0000-\u001f]|(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}|(?:token|serial|pairing|password|authorization)\s*[:=]/i;
export const publicHomeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (v) => !privateMaterial.test(v),
      "Private device material is not accepted",
    );
export const localActionType = z.enum([
  "read_status",
  "power_on",
  "power_off",
  "brightness",
  "thermostat_temperature",
  "scene",
]);
export const nativeAuditSchema = z
  .object({
    deviceName: publicHomeText(100),
    actionType: localActionType,
    state: z.enum(["completed", "failed"]),
    message: z.enum([
      "Status read locally.",
      "Apple Home accepted the action; physical state is not yet verified.",
      "Verified on by Apple Home readback.",
      "Verified off by Apple Home readback.",
      "Apple Home could not confirm this action. Check the accessory before trying again.",
    ]),
    timestamp: z.iso
      .datetime({ offset: true })
      .refine(
        (v) =>
          Date.parse(v) >= Date.now() - 30 * 86400000 &&
          Date.parse(v) <= Date.now() + 300000,
      ),
  })
  .strict();
export const nativeAuditKey = z.uuid();
export const localManifestSchema = z
  .object({
    actions: z
      .array(
        z
          .object({
            actionId: z.uuid(),
            deviceName: publicHomeText(100),
            actionType: localActionType,
            label: publicHomeText(140),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .refine(
    (v) => new Set(v.actions.map((a) => a.actionId)).size === v.actions.length,
  );
export const localRequestSchema = z.object({ actionId: z.uuid() }).strict();
