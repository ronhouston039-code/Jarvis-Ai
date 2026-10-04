import { z } from "zod";
import type { HomeDevice } from "../../jarvis/home-assistant-contracts";

export type HomeDashboardPhase =
  | "checking"
  | "not_configured"
  | "disabled"
  | "forbidden"
  | "unavailable"
  | "connected";
export type HomeDashboardSnapshot = {
  phase: HomeDashboardPhase;
  devices: HomeDevice[];
  tv: HomeDevice | null;
  /** Time this browser received a successful authenticated device read. */
  retrievedAt: string | null;
};
export type HomeDashboardFetcher = (
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) => Promise<Response>;

const deviceSchema = z.object({
  id: z.string().regex(/^ha-[a-f0-9]{24}$/),
  name: z.string().min(1).max(100),
  room: z.string().max(100),
  type: z.string().min(1).max(30),
  online: z.boolean(),
  state: z.string().min(1).max(100),
  lastUpdated: z.iso.datetime().nullable(),
  actions: z.array(z.string().max(40)).max(14),
  confirmationActions: z.array(z.string().max(40)).max(14),
  brightness: z.number().finite().optional(),
  colorTemperature: z.number().finite().optional(),
  temperature: z.number().finite().optional(),
  temperatureUnit: z.enum(["C", "F"]).optional(),
  volume: z.number().finite().optional(),
});
export function emptyHomeDashboard(
  phase: HomeDashboardPhase,
): HomeDashboardSnapshot {
  return { phase, devices: [], tv: null, retrievedAt: null };
}

/** Choose a TV only when its friendly name identifies a unique approved media device. */
export function selectDashboardTV(devices: HomeDevice[]): HomeDevice | null {
  const media = devices.filter((device) => device.type === "media");
  const branded = media.filter((device) =>
    /\b(?:tcl|roku)\b/i.test(device.name),
  );
  if (branded.length) return branded.length === 1 ? branded[0] : null;
  const televisions = media.filter((device) =>
    /\b(?:tv|television)\b/i.test(device.name),
  );
  return televisions.length === 1 ? televisions[0] : null;
}

/** Read-only: never enables an integration, executes a command, or approves a confirmation. */
export async function readHomeDashboard(
  fetcher: HomeDashboardFetcher,
  signal?: AbortSignal,
): Promise<HomeDashboardSnapshot> {
  const base = "/api/jarvis/connections/home-assistant/";
  try {
    const response = await fetcher(base + "config", undefined, signal);
    if (response.status === 401 || response.status === 403)
      return emptyHomeDashboard("forbidden");
    const config = z
      .object({ available: z.boolean(), enabled: z.boolean() })
      .safeParse(await response.json());
    if (!config.success) return emptyHomeDashboard("unavailable");
    if (!config.data.enabled) return emptyHomeDashboard("disabled");
    if (!config.data.available && (response.ok || response.status === 409))
      return emptyHomeDashboard("not_configured");
    if (!response.ok) return emptyHomeDashboard("unavailable");
    const devicesResponse = await fetcher(base + "devices", undefined, signal);
    if (devicesResponse.status === 401 || devicesResponse.status === 403)
      return emptyHomeDashboard("forbidden");
    if (!devicesResponse.ok) return emptyHomeDashboard("unavailable");
    const result = z
      .object({
        connected: z.literal(true),
        devices: z.array(deviceSchema).max(300),
      })
      .safeParse(await devicesResponse.json());
    if (!result.success) return emptyHomeDashboard("unavailable");
    return {
      phase: "connected",
      devices: result.data.devices,
      tv: selectDashboardTV(result.data.devices),
      retrievedAt: new Date().toISOString(),
    };
  } catch {
    return emptyHomeDashboard("unavailable");
  }
}
