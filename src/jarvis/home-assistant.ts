import { z } from "zod";
import {
  allowedDeviceSchema,
  homeActionSchema,
  publicHomeUrl,
  type DevicePolicy,
  type HomeAction,
  type HomeDevice,
} from "./home-assistant-contracts";
const domains = new Set([
  "light",
  "switch",
  "climate",
  "scene",
  "media_player",
  "lock",
  "cover",
  "alarm_control_panel",
  "camera",
]);
const stateSchema = z.object({
  entity_id: z.string().max(200),
  state: z.string().max(100),
  attributes: z.record(z.string(), z.unknown()),
  last_updated: z.string().max(100).optional(),
});
type State = z.infer<typeof stateSchema>;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
function label(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const clean = value
    .replace(
      /https?:\/\/\S+|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:light|switch|climate|scene|media_player|lock|cover|alarm_control_panel|camera)\.[a-z0-9_]+\b/g,
      "",
    )
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 100);
  return clean || fallback;
}
const knownStates = new Set([
  "on",
  "off",
  "unknown",
  "unavailable",
  "playing",
  "paused",
  "idle",
  "standby",
  "locked",
  "unlocked",
  "open",
  "closed",
  "opening",
  "closing",
  "heat",
  "cool",
  "auto",
  "fan_only",
  "dry",
  "heat_cool",
  "disarmed",
  "armed_home",
  "armed_away",
  "armed_night",
  "armed_vacation",
  "armed_custom_bypass",
  "pending",
  "arming",
  "triggered",
]);
export class HomeAssistantProvider {
  private base: string;
  private policies: DevicePolicy[];
  constructor(
    url: string,
    private token: string,
    policies = "[]",
    private fetcher: typeof fetch = fetch,
  ) {
    this.base = publicHomeUrl(url);
    if (!token.trim() || /[\r\n]/.test(token))
      throw new Error("home_assistant_invalid_configuration");
    try {
      this.policies = allowedDeviceSchema.parse(JSON.parse(policies));
    } catch {
      throw new Error("home_assistant_invalid_allowlist");
    }
  }
  async fingerprint() {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify([this.base, this.token, this.policies]),
      ),
    );
    return Array.from(new Uint8Array(bytes), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
  }
  private async id(entity: string) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(this.token),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const bytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(this.base + "\n" + entity),
    );
    return (
      "ha-" +
      Array.from(new Uint8Array(bytes).slice(0, 12), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("")
    );
  }
  private async request(path: string, body?: unknown) {
    const response = await this.fetcher(this.base + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("home_assistant_unavailable");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("home_assistant_invalid_response");
    const chunks: Uint8Array[] = [];
    let count = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      count += item.value.length;
      if (count > 2_000_000) {
        await reader.cancel();
        throw new Error("home_assistant_response_too_large");
      }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  }
  private policy(entity: string) {
    return this.policies.find((p) => p.entity === entity);
  }
  private actions(state: State): string[] {
    const domain = state.entity_id.split(".")[0];
    const a = state.attributes;
    const available: Record<string, string[]> = {
      light: ["on", "off"],
      switch: ["on", "off"],
      climate: [],
      scene: ["scene"],
      media_player: [],
      lock: ["unlock"],
      cover: ["open"],
      alarm_control_panel: ["disarm"],
      camera: [],
    };
    const modes = Array.isArray(a.supported_color_modes)
      ? a.supported_color_modes
      : [];
    if (domain === "light") {
      if (
        finite(a.brightness) ||
        modes.some((m) =>
          [
            "brightness",
            "color_temp",
            "hs",
            "rgb",
            "rgbw",
            "rgbww",
            "xy",
            "white",
          ].includes(String(m)),
        )
      )
        available.light.push("brightness");
      if (modes.includes("color_temp"))
        available.light.push("color_temperature");
    }
    if (
      domain === "climate" &&
      finite(a.supported_features) &&
      a.supported_features & 1 &&
      finite(a.min_temp) &&
      finite(a.max_temp)
    )
      available.climate.push("temperature");
    if (domain === "media_player" && finite(a.supported_features)) {
      for (const [feature, action] of [
        [128, "on"],
        [256, "off"],
        [16384, "play"],
        [1, "pause"],
        [4, "volume"],
        [8, "mute"],
      ] as const)
        if (a.supported_features & feature) available.media_player.push(action);
    }
    const granted = this.policy(state.entity_id)?.actions ?? [];
    return (available[domain] ?? []).filter((action) =>
      granted.includes(action as DevicePolicy["actions"][number]),
    );
  }
  sensitive(state: State, action: HomeAction): boolean {
    const policy = this.policy(state.entity_id);
    return (
      ["unlock", "open", "disarm", "scene"].includes(action.action) ||
      (state.entity_id.startsWith("media_player.") &&
        action.action === "off") ||
      policy?.category === "security" ||
      policy?.category === "privacy" ||
      /security|alarm|camera|privacy/i.test(state.entity_id)
    );
  }
  private async normalized(state: State, unit: "C" | "F"): Promise<HomeDevice> {
    const a = state.attributes;
    const policy = this.policy(state.entity_id);
    const domain = state.entity_id.split(".")[0];
    const id = await this.id(state.entity_id);
    const actions = this.actions(state);
    return {
      id,
      name: label(
        policy?.name ?? a.friendly_name,
        domain === "media_player"
          ? "Media device"
          : domain === "alarm_control_panel"
            ? "Security system"
            : domain[0].toUpperCase() + domain.slice(1),
      ),
      room: label(policy?.room ?? a.area_name ?? a.room, "Unassigned"),
      type:
        domain === "media_player"
          ? "media"
          : domain === "climate"
            ? "thermostat"
            : domain === "alarm_control_panel"
              ? "security"
              : domain === "cover"
                ? a.device_class === "garage"
                  ? "garage"
                  : "cover"
                : domain,
      online:
        state.state !== "unavailable" &&
        (domain === "scene" || state.state !== "unknown"),
      state:
        domain === "scene" && state.state !== "unavailable"
          ? "ready"
          : knownStates.has(state.state)
            ? state.state
            : "unknown",
      lastUpdated:
        state.last_updated && Number.isFinite(Date.parse(state.last_updated))
          ? new Date(state.last_updated).toISOString()
          : null,
      actions,
      confirmationActions: actions.filter((action) => action !== "status"),
      ...(finite(a.brightness)
        ? { brightness: Math.round((a.brightness / 255) * 100) }
        : {}),
      ...(finite(a.color_temp_kelvin)
        ? { colorTemperature: a.color_temp_kelvin }
        : {}),
      ...(finite(a.temperature)
        ? { temperature: a.temperature, temperatureUnit: unit }
        : {}),
      ...(finite(a.volume_level) ? { volume: a.volume_level } : {}),
    };
  }
  private async states() {
    const raw = await this.request("states");
    if (!Array.isArray(raw) || raw.length > 10000)
      throw new Error("home_assistant_invalid_response");
    return raw
      .map((item) => stateSchema.safeParse(item))
      .filter((item) => item.success)
      .map((item) => item.data!)
      .filter(
        (state) =>
          /^(light|switch|climate|scene|media_player|lock|cover|alarm_control_panel|camera)\.[a-z0-9_]+$/.test(
            state.entity_id,
          ) && domains.has(state.entity_id.split(".")[0]),
      );
  }
  private async temperatureUnit(): Promise<"C" | "F"> {
    const config = await this.request("config");
    const unit = z
      .object({ unit_system: z.object({ temperature: z.enum(["°C", "°F"]) }) })
      .safeParse(config);
    if (!unit.success) throw new Error("home_assistant_unknown_units");
    return unit.data.unit_system.temperature === "°F" ? "F" : "C";
  }
  async listDevices(): Promise<HomeDevice[]> {
    const states = (await this.states()).filter((state) =>
      this.policy(state.entity_id),
    );
    const unit = states.some((s) => s.entity_id.startsWith("climate."))
      ? await this.temperatureUnit()
      : "C";
    return Promise.all(
      states
        .filter((state) => this.policy(state.entity_id))
        .map((state) => this.normalized(state, unit)),
    );
  }
  async prepare(input: unknown) {
    const action = homeActionSchema.parse(input);
    const states = await this.states();
    let found: State | undefined;
    for (const state of states)
      if ((await this.id(state.entity_id)) === action.deviceId) {
        found = state;
        break;
      }
    if (!found || !this.policy(found.entity_id))
      throw new Error("home_assistant_device_not_found");
    const unit = found.entity_id.startsWith("climate.")
      ? await this.temperatureUnit()
      : "C";
    const device = await this.normalized(found, unit);
    if (action.action === "status")
      return { action, device, state: found, unit, sensitive: false };
    if (!device.online || !device.actions.includes(action.action))
      throw new Error("home_assistant_action_not_allowed");
    if (action.action === "color_temperature") {
      const min = finite(found.attributes.min_color_temp_kelvin)
        ? found.attributes.min_color_temp_kelvin
        : 2000;
      const max = finite(found.attributes.max_color_temp_kelvin)
        ? found.attributes.max_color_temp_kelvin
        : 6500;
      if (action.value < min || action.value > max)
        throw new Error("home_assistant_invalid_value");
    }
    if (action.action === "temperature") {
      const value =
        unit === action.unit
          ? action.value
          : unit === "F"
            ? (action.value * 9) / 5 + 32
            : ((action.value - 32) * 5) / 9;
      if (
        value < Number(found.attributes.min_temp) ||
        value > Number(found.attributes.max_temp)
      )
        throw new Error("home_assistant_invalid_value");
    }
    return {
      action,
      device,
      state: found,
      unit,
      sensitive: this.sensitive(found, action),
    };
  }
  async execute(input: unknown, confirmed = false) {
    const prepared = await this.prepare(input);
    const { action, device, state, unit } = prepared;
    if (action.action === "status") return { status: "completed", device };
    if (!confirmed)
      throw new Error("home_assistant_confirmation_required");
    const domain = state.entity_id.split(".")[0];
    const payload: Record<string, unknown> = { entity_id: state.entity_id };
    let service: string;
    switch (action.action) {
      case "on":
        service = "turn_on";
        break;
      case "off":
        service = "turn_off";
        break;
      case "brightness":
        service = action.value === 0 ? "turn_off" : "turn_on";
        if (action.value) payload.brightness_pct = action.value;
        break;
      case "color_temperature":
        service = "turn_on";
        payload.color_temp_kelvin = action.value;
        break;
      case "temperature":
        service = "set_temperature";
        payload.temperature =
          unit === action.unit
            ? action.value
            : unit === "F"
              ? (action.value * 9) / 5 + 32
              : ((action.value - 32) * 5) / 9;
        break;
      case "scene":
        service = "turn_on";
        break;
      case "play":
        service = "media_play";
        break;
      case "pause":
        service = "media_pause";
        break;
      case "volume":
        service = "volume_set";
        payload.volume_level = action.value;
        break;
      case "mute":
        service = "volume_mute";
        payload.is_volume_muted = true;
        break;
      case "unlock":
        service = "unlock";
        break;
      case "open":
        service = "open_cover";
        break;
      case "disarm":
        service = "alarm_disarm";
        break;
      default:
        throw new Error("home_assistant_action_not_allowed");
    }
    await this.request(`services/${domain}/${service}`, payload);
    try {
      const updated = stateSchema.parse(
        await this.request("states/" + encodeURIComponent(state.entity_id)),
      );
      return {
        status: "accepted",
        stateRetrieved: true,
        device: await this.normalized(updated, unit),
      };
    } catch {
      return {
        status: "accepted",
        stateRetrieved: false,
        deviceId: device.id,
        message: "Command accepted; current state could not be verified.",
      };
    }
  }
}
