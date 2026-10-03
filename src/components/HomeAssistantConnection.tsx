import { useEffect, useState } from "react";
import { authenticatedFetch } from "../jarvis/client";
import type {
  HomeAction,
  HomeDevice,
} from "../jarvis/home-assistant-contracts";
import { Button, Input } from "./ui";
export function HomeAssistantConnection() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<HomeDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Checking connection setup…");
  const [pending, setPending] = useState<{
    token: string;
    prompt: string;
    action: HomeAction;
  } | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  useEffect(() => {
    let active = true;
    void authenticatedFetch("/api/jarvis/connections/home-assistant/config")
      .then(async (response) => {
        const data = (await response.json()) as {
          available?: boolean;
          enabled?: boolean;
        };
        if (active) {
          setAvailable(!!data.available);
          setEnabled(data.enabled !== false);
          setStatus(
            data.available
              ? "Configured. Test connection to load your devices."
              : "Setup required: add HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN in server Secrets, then redeploy.",
          );
        }
      })
      .catch(() => {
        if (active) setStatus("Could not check Home Assistant setup.");
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(path: string, body?: unknown) {
    setBusy(true);
    setStatus("");
    try {
      const response = await authenticatedFetch(
        "/api/jarvis/connections/home-assistant/" + path,
        body,
      );
      const data = (await response.json()) as {
        devices?: HomeDevice[];
        device?: HomeDevice;
        status?: string;
        token?: string;
        prompt?: string;
        action?: HomeAction;
        enabled?: boolean;
        message?: string;
      };
      if (!response.ok) {
        if (path === "devices") {
          setConnected(false);
          setDevices([]);
        }
        setStatus(
          data.message ??
            "Home Assistant is unavailable or this action is not permitted.",
        );
        return;
      }
      if (data.status === "confirmation_required" && data.token && data.action)
        setPending({
          token: data.token,
          prompt: data.prompt ?? "Confirm this exact device action?",
          action: data.action,
        });
      else if (path === "devices") {
        setDevices(data.devices ?? []);
        setConnected(true);
        setStatus(
          "Device status updated. Devices with no approved actions are read-only.",
        );
      } else if (path === "connect" || path === "disconnect") {
        setEnabled(data.enabled === true);
        setConnected(false);
        setDevices([]);
        setPending(null);
        setStatus(
          data.enabled
            ? "Connection enabled. Test connection to load devices."
            : "Home Assistant disconnected. Stored server credentials remain in Secrets.",
        );
      } else if (path === "cancel") {
        setPending(null);
        setStatus("Action cancelled.");
      } else {
        if (data.device)
          setDevices((items) =>
            items.map((item) =>
              item.id === data.device!.id ? data.device! : item,
            ),
          );
        setStatus(
          data.message ??
            (data.status === "completed"
              ? "Device status updated."
              : "Command accepted. Check the current device state below."),
        );
      }
    } catch {
      if (path === "devices") {
        setConnected(false);
        setDevices([]);
      }
      setStatus(
        "Home Assistant could not confirm the request. Check the device before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  function action(device: HomeDevice, name: string) {
    const value = values[device.id + name];
    let request: HomeAction;
    if (name === "brightness")
      request = {
        deviceId: device.id,
        action: name,
        value: value ?? device.brightness ?? 50,
      };
    else if (name === "color_temperature")
      request = {
        deviceId: device.id,
        action: name,
        value: value ?? device.colorTemperature ?? 2700,
      };
    else if (name === "temperature")
      request = {
        deviceId: device.id,
        action: name,
        value:
          value ??
          device.temperature ??
          (device.temperatureUnit === "F" ? 68 : 20),
        unit: device.temperatureUnit ?? "C",
      };
    else if (name === "volume")
      request = {
        deviceId: device.id,
        action: name,
        value: value ?? device.volume ?? 0.2,
      };
    else request = { deviceId: device.id, action: name } as HomeAction;
    void run("action", request);
  }
  return (
    <section aria-label="Home Assistant connection">
      <div className="personal-card">
        <div>
          <h2>Apple Home-compatible devices · Home Assistant</h2>
          <p>
            {!enabled
              ? "Disconnected"
              : connected
                ? "Connected"
                : available
                  ? "Not tested"
                  : "Not connected"}
          </p>
          <p>
            Jarvis uses your Home data to show and control the accessories you
            choose.
          </p>
          <p>
            Home Assistant is the bridge at home. JARVIS uses its secure HTTPS
            API; it does not access HomeKit or local device ports.
          </p>
          <div className="connection-actions">
            <Button
              disabled={busy || !available || !enabled}
              onClick={() => void run("devices")}
            >
              Test connection / Refresh devices
            </Button>
            <Button
              variant="outline"
              disabled={busy || !available}
              onClick={() => void run(enabled ? "disconnect" : "connect", {})}
            >
              {enabled
                ? "Disconnect Home Assistant"
                : "Reconnect Home Assistant"}
            </Button>
          </div>
          <p>
            Controls require a server-side approved device/action list. Rooms
            show Unassigned when no room metadata is available.
          </p>
          <p role="status">{status}</p>
        </div>
      </div>
      {devices.map((device) => (
        <div className="personal-card" key={device.id}>
          <div>
            <h3>{device.name}</h3>
            <p>
              {device.room} · {device.type} ·{" "}
              {device.online ? "Online" : "Offline"}
            </p>
            <p>
              Current state: {device.state}
              {device.brightness !== undefined
                ? ` · ${device.brightness}% brightness`
                : ""}
              {device.temperature !== undefined
                ? ` · ${device.temperature}°${device.temperatureUnit}`
                : ""}
            </p>
            <p>
              Last updated:{" "}
              {device.lastUpdated
                ? new Date(device.lastUpdated).toLocaleString()
                : "Unavailable"}
            </p>
            {!device.actions.length && (
              <p>Read-only · No device actions approved.</p>
            )}
            {device.actions.map((name) => (
              <div className="connection-actions" key={name}>
                {[
                  "brightness",
                  "color_temperature",
                  "temperature",
                  "volume",
                ].includes(name) && (
                  <label>
                    {name.replace(/_/g, " ")}
                    <Input
                      aria-label={`${device.name} ${name}`}
                      type="number"
                      min={
                        name === "color_temperature"
                          ? 2000
                          : name === "temperature"
                            ? 5
                            : 0
                      }
                      max={
                        name === "brightness"
                          ? 100
                          : name === "color_temperature"
                            ? 6500
                            : name === "temperature"
                              ? 95
                              : 1
                      }
                      step={name === "volume" ? 0.05 : 1}
                      value={
                        values[device.id + name] ??
                        (name === "brightness"
                          ? (device.brightness ?? 50)
                          : name === "color_temperature"
                            ? (device.colorTemperature ?? 2700)
                            : name === "temperature"
                              ? (device.temperature ??
                                (device.temperatureUnit === "F" ? 68 : 20))
                              : (device.volume ?? 0.2))
                      }
                      onChange={(event) =>
                        setValues({
                          ...values,
                          [device.id + name]: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                )}
                <Button
                  variant="outline"
                  disabled={busy || !device.online}
                  onClick={() => action(device, name)}
                >
                  {name === "scene" ? "Run scene" : name.replace(/_/g, " ")}
                  {device.confirmationActions.includes(name)
                    ? " · Confirm"
                    : ""}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm smart-home action"
          className="personal-card"
        >
          <div>
            <h3>{pending.prompt}</h3>
            <p>
              Exact action: {pending.action.action.replace(/_/g, " ")}
              {"value" in pending.action ? ` · ${pending.action.value}` : ""}
              {"unit" in pending.action ? `°${pending.action.unit}` : ""}
            </p>
            <p>
              Expires after one minute. This confirmation authorizes only this
              device and these parameters.
            </p>
            <div className="connection-actions">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run("cancel", { token: pending.token })}
              >
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  const token = pending.token;
                  setPending(null);
                  void run("approve", { token });
                }}
              >
                Confirm action
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
