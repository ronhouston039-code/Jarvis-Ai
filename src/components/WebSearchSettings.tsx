import { useEffect, useState } from "react";
import { useQuery } from "deepspace";
import { authenticatedFetch } from "../jarvis/client";

export function WebSearchSettings() {
  const { records, status } = useQuery<{ liveWebSearch?: number | boolean }>("preferences", { limit: 1 });
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void authenticatedFetch("/api/jarvis/search/config", undefined, controller.signal).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json() as { configured?: unknown };
      if (!controller.signal.aborted) setConfigured(data.configured === true);
    }).catch(() => { if (!controller.signal.aborted) setConfigured(false); });
    return () => controller.abort("dispose");
  }, []);
  const enabled = configured === true && records[0]?.data.liveWebSearch !== false && records[0]?.data.liveWebSearch !== 0;
  return <section aria-label="Live web search settings">
    <label className="settings-row">Live web search
      <input type="checkbox" role="switch" aria-label="Live web search" checked={enabled} disabled={busy || status !== "ready" || configured !== true} onChange={async event => {
        const value = event.target.checked; setBusy(true); setMessage("");
        try {
          const response = await authenticatedFetch("/api/jarvis/preferences", { liveWebSearch: value });
          const data = await response.json() as { success?: boolean };
          setMessage(response.ok && data.success ? "Search preference saved." : "Could not save search preference.");
        } catch { setMessage("Could not save search preference."); }
        finally { setBusy(false); }
      }} />
    </label>
    <p className="settings-note">{configured === null ? "Checking search configuration…" : configured ? "Server configuration available. Public search queries are sent to Tavily; availability is verified per request." : "Live web search is not connected yet."}</p>
    <p role="status">{message}</p>
  </section>;
}
