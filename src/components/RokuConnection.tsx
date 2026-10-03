import { useState } from "react";
import { authenticatedFetch } from "../jarvis/client";
import { Button } from "./ui";
import { rokuKeys } from "../jarvis/roku-keys";
type Status = {
  online?: boolean;
  enabled?: boolean;
  configured?: boolean;
  name?: string;
  message?: string;
  error?: string;
};
export function RokuConnection() {
  const [state, setState] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  async function run(path: string, body?: unknown) {
    setBusy(true);
    setStatus("");
    if (path === "power/approve") setToken(null);
    try {
      const response = await authenticatedFetch(
        "/api/jarvis/connections/roku/" + path,
        body,
      );
      const data = (await response.json()) as Status & {
        token?: string;
        accepted?: boolean;
      };
      if (path === "status") setState(data);
      if (!response.ok) {
        setStatus(
          data.message ??
            (data.error === "owner_roku_only"
              ? "Only the configured TV owner can access this connection."
              : "Could not reach TCL Roku TV."),
        );
        return;
      }
      if (path === "power/request") setToken(data.token ?? null);
      else if (path === "disconnect") {
        setState({ enabled: false, online: false });
        setToken(null);
        setStatus("TCL Roku TV disconnected from JARVIS.");
      } else if (path === "connect") {
        setState(null);
        setStatus("Connection enabled. Test connection to check availability.");
      } else if (path === "power/cancel") {
        setToken(null);
        setStatus("Power-off cancelled.");
      } else if (path === "power/approve") {
        setToken(null);
        setStatus("Power-off command accepted by TCL Roku TV.");
      } else if (path === "action")
        setStatus(
          data.accepted
            ? "Remote command accepted by TCL Roku TV."
            : "Some volume commands may have been sent. Check the TV before trying again.",
        );
      else
        setStatus(
          data.online ? "TCL Roku TV is reachable." : "TCL Roku TV is offline.",
        );
    } catch {
      if (path === "status") setState({ online: false });
      setStatus(
        "TCL Roku TV is offline or the connection could not be reached.",
      );
    } finally {
      setBusy(false);
    }
  }
  const disconnected = state?.enabled === false;
  return (
    <section className="personal-card" aria-label="TCL Roku TV connection">
      <div>
        <h2>TCL Roku TV</h2>
        <p>
          {disconnected
            ? "Disconnected"
            : state
              ? state.online
                ? "Connected"
                : "Offline"
              : "Not tested"}
        </p>
        <p>
          Server-side Roku ECP. Cloud hosting needs a secure route to the TV’s
          local network.
        </p>
        <div className="connection-actions">
          <Button
            disabled={busy || disconnected}
            onClick={() => void run("status")}
          >
            Test connection
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(disconnected ? "connect" : "disconnect", {})
            }
          >
            {disconnected ? "Reconnect TV" : "Disconnect / remove TV"}
          </Button>
        </div>
        {!disconnected && (
          <>
            <div className="connection-actions">
              {rokuKeys.map((key) => (
                <Button
                  key={key}
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run("action", { tool: "roku_keypress", key })
                  }
                >
                  {key === "Play" ? "Play / Pause" : key}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run("power/request", {})}
            >
              Turn off TV
            </Button>
          </>
        )}
        {token && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Turn off TCL Roku TV confirmation"
          >
            <p>Turn off TCL Roku TV now?</p>
            <div className="connection-actions">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run("power/cancel", { token })}
              >
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() => void run("power/approve", { token })}
              >
                Turn off TV
              </Button>
            </div>
            <small>
              Confirmation expires after one minute. Failed power commands are
              not automatically retried.
            </small>
          </div>
        )}
        <p role="status">{status}</p>
      </div>
    </section>
  );
}
