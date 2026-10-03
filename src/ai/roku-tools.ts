import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { rokuKeys } from "../jarvis/roku";
import type { RokuExecutor } from "../jarvis/roku-ledger";
export function rokuTools(execute: RokuExecutor): ToolSet {
  return {
    roku_get_status: tool({
      description:
        "Read actual TCL Roku TV device status and the saved allowed app list. Offline means the local device could not be reached from the server.",
      inputSchema: z.object({}).strict(),
      execute: () => execute({ tool: "roku_get_status" }),
    }),
    roku_keypress: tool({
      description:
        "Send an allow-listed Roku remote key after the user requests navigation or playback. Play toggles play/pause; acceptance does not verify the resulting playback state.",
      inputSchema: z.object({ key: z.enum(rokuKeys) }).strict(),
      execute: ({ key }) => execute({ tool: "roku_keypress", key }),
    }),
    roku_power_off: tool({
      description:
        "Request explicit UI confirmation to turn off TCL Roku TV. This tool NEVER executes power off. Direct the user to the connection card to confirm; a conversational yes does not substitute for the confirmation sheet.",
      inputSchema: z.object({}).strict(),
      execute: () => execute({}, "roku_power_request"),
    }),
    roku_launch_app: tool({
      description:
        "Launch an app only by its ID in the saved allowed app list from roku_get_status. Never invent an app ID or bypass a refusal.",
      inputSchema: z.object({ appId: z.string().regex(/^\d{1,10}$/) }).strict(),
      execute: ({ appId }) => execute({ tool: "roku_launch_app", appId }),
    }),
    roku_set_volume: tool({
      description:
        "Change TCL Roku TV volume by one to five relative keypresses. This is not an absolute volume percentage. Do not retry partial or unknown results.",
      inputSchema: z
        .object({
          direction: z.enum(["up", "down"]),
          steps: z.number().int().min(1).max(5).default(1),
        })
        .strict(),
      execute: (input) => execute({ tool: "roku_set_volume", ...input }),
    }),
  };
}
