import { z } from "zod";
import { rokuKeys } from "./roku-keys";
export { rokuKeys } from "./roku-keys";
export const rokuAction = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("roku_get_status") }).strict(),
  z
    .object({ tool: z.literal("roku_keypress"), key: z.enum(rokuKeys) })
    .strict(),
  z
    .object({
      tool: z.literal("roku_launch_app"),
      appId: z.string().regex(/^\d{1,10}$/),
    })
    .strict(),
  z
    .object({
      tool: z.literal("roku_set_volume"),
      direction: z.enum(["up", "down"]),
      steps: z.number().int().min(1).max(5).default(1),
    })
    .strict(),
]);
export function privateRokuIp(value: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return false;
  const p = value.split(".").map(Number);
  if (p.some((n) => n > 255) || p[3] === 0 || p[3] === 255) return false;
  return (
    p[0] === 10 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168)
  );
}
export const rokuAppsSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^\d{1,10}$/),
        name: z.string().trim().min(1).max(100),
      })
      .strict(),
  )
  .max(100);
export function allowedRokuApps(value?: string) {
  try {
    return rokuAppsSchema.parse(JSON.parse(value ?? "[]"));
  } catch {
    return [];
  }
}
export class RokuProvider {
  private base: string;
  constructor(
    ip: string,
    private apps: { id: string; name: string }[],
    private fetcher: typeof fetch = fetch,
  ) {
    if (!privateRokuIp(ip)) throw new Error("roku_invalid_configuration");
    this.base = `http://${ip}:8060`;
  }
  private async request(path: string, method: "GET" | "POST") {
    const response = await this.fetcher(this.base + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error("roku_unavailable");
    return response;
  }
  async status() {
    const response = await this.request("/query/device-info", "GET");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("roku_invalid_response");
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.length;
      if (bytes > 32768) {
        await reader.cancel();
        throw new Error("roku_invalid_response");
      }
      chunks.push(item.value);
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    const xml = new TextDecoder().decode(data);
    if (!xml.includes("<device-info") || /<!DOCTYPE|<!ENTITY/i.test(xml))
      throw new Error("roku_invalid_response");
    const tag = (name: string) =>
      (xml.match(new RegExp(`<${name}>([^<]{0,200})</${name}>`))?.[1] ?? "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
    return {
      online: true,
      name:
        tag("user-device-name") ||
        tag("friendly-device-name") ||
        tag("model-name") ||
        "Roku TV",
      powerMode: tag("power-mode") || "unknown",
      allowedApps: this.apps,
    };
  }
  async keypress(key: unknown) {
    const validated = z.enum(rokuKeys).parse(key);
    await this.request(`/keypress/${validated}`, "POST");
    return { accepted: true, key: validated };
  }
  async launch(appId: string) {
    const id = z
      .string()
      .regex(/^\d{1,10}$/)
      .parse(appId);
    if (!this.apps.some((app) => app.id === id))
      throw new Error("roku_app_not_allowed");
    await this.request(`/launch/${id}`, "POST");
    return { accepted: true, appId: id };
  }
  async volume(direction: string, steps: number) {
    const action = rokuAction.parse({
      tool: "roku_set_volume",
      direction,
      steps,
    });
    if (action.tool !== "roku_set_volume") throw new Error("invalid_action");
    let completed = 0;
    try {
      for (; completed < action.steps; completed++)
        await this.keypress(
          action.direction === "up" ? "VolumeUp" : "VolumeDown",
        );
    } catch {
      return {
        accepted: false,
        completedSteps: completed,
        error: "roku_partial_or_unknown_result",
        retrySafe: false,
      };
    }
    return { accepted: true, completedSteps: completed };
  }
  /** Caller must claim a user-bound confirmation before calling this method. Never register directly as an executable model tool. */
  async powerOff() {
    await this.request("/keypress/PowerOff", "POST");
    return { accepted: true, action: "power_off" };
  }
}
