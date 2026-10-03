import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  homeActionSchema,
  haDeviceId,
} from "../jarvis/home-assistant-contracts";
import { untrusted } from "../jarvis/contracts";
import type { HomeExecutor } from "../jarvis/home-assistant-ledger";
export function homeTools(execute: HomeExecutor): ToolSet {
  return {
    list_home_devices: tool({
      description:
        "List Home Assistant devices by friendly name, room, capabilities, state and public opaque ID. Listed actions are owner-approved. No entity IDs, private addresses or credentials are provided.",
      inputSchema: z.object({}).strict(),
      execute: async () => untrusted(await execute(undefined, "home_devices")),
    }),
    get_home_device_status: tool({
      description:
        "Read a device status using its opaque ID from list_home_devices.",
      inputSchema: z.object({ deviceId: haDeviceId }).strict(),
      execute: async ({ deviceId }) =>
        untrusted(await execute({ deviceId, action: "status" })),
    }),
    control_home_device: tool({
      description:
        "Execute only an explicitly requested, listed device action. Brightness is 0–100 percent, color_temperature is Kelvin, thermostat temperature includes C/F, and media volume is 0–1. Sensitive actions and scenes return confirmation_required without execution; direct the user to the Home Assistant connection card. You cannot approve confirmations. Do not automatically retry uncertain commands. Accepted is not proof of the final device state.",
      inputSchema: homeActionSchema,
      execute: async (action) => untrusted(await execute(action)),
    }),
  };
}
