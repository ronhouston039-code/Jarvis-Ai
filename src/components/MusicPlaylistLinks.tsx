import { useState } from "react";
import { useQuery } from "deepspace";
import { authenticatedFetch } from "../jarvis/client";
import { openAppleMusic } from "./apple-music";
import { validApplePlaylistUrl } from "../jarvis/music-links";
import { Button, Input } from "./ui";
type MusicLink = {
  preset: string;
  label: string;
  url: string;
  enabled: number;
};
export function MusicPlaylistLinks() {
  const { records } = useQuery<MusicLink>("music-links", {
    where: { enabled: 1 },
  });
  const [preset, setPreset] = useState("focus");
  const [label, setLabel] = useState(() => new URLSearchParams(window.location.search).get("playlistName")?.slice(0, 100) ?? "");
  const [url, setUrl] = useState(() => {
    const shared = new URLSearchParams(window.location.search).get("playlistUrl") ?? "";
    return validApplePlaylistUrl(shared) ? shared : "";
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!validApplePlaylistUrl(url)) {
      setStatus(
        "Paste a real Apple Music playlist share link, not a placeholder.",
      );
      return;
    }
    setBusy(true);
    try {
      const r = await authenticatedFetch(
        "/api/jarvis/connections/music-links",
        { preset, label, url, enabled: 1 },
      );
      await r.json();
      setStatus(
        r.ok ? "Playlist shortcut saved." : "Could not save playlist shortcut.",
      );
    } catch {
      setStatus("Could not connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(recordId: string) {
    setBusy(true);
    try {
      const r = await authenticatedFetch("/api/jarvis/connections/disable", {
        collection: "music-links",
        recordId,
      });
      await r.json();
      setStatus(
        r.ok
          ? "Playlist shortcut removed."
          : "Could not remove playlist shortcut.",
      );
    } catch {
      setStatus("Could not connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="personal-card">
      <div style={{ width: "100%" }}>
        <h2>MUSIC</h2>
        <p>Your preferred service<br /><strong>Apple Music</strong></p>
        <h3>Quick play</h3>
        <p>
          “Jarvis, play my focus playlist” — opens Apple Music. Add
          real share links from Apple Music. Opening a link does not grant
          JARVIS library access or confirm playback.
        </p>
        <div className="connection-actions">
          {["focus", "workout", "relax"].map((p) => {
            const link = records.find(
              (r) => r.data.preset === p && validApplePlaylistUrl(r.data.url),
            );
            return (
              <Button
                key={p}
                variant="outline"
                onClick={() => {
                  if (link) {
                    openAppleMusic(link.data.url);
                    setStatus(
                      `Opening your ${p[0].toUpperCase() + p.slice(1)} playlist in Apple Music.`,
                    );
                  } else {
                    setPreset(p);
                    setStatus(`Add your ${p} playlist link below.`);
                  }
                }}
              >
                {p[0].toUpperCase() + p.slice(1)}
                
              </Button>
            );
          })}
        </div>
        {records.map((r) => (
          <div className="connection-actions" key={r.recordId}>
            <span>
              {r.data.label} · {r.data.preset}
            </span>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void remove(r.recordId)}
            >
              Remove {r.data.label}
            </Button>
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            Preset
            <select
              aria-label="Playlist preset"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              <option value="focus">Focus</option>
              <option value="workout">Workout</option>
              <option value="relax">Relax</option>
            </select>
          </label>
          <label>
            Name
            <Input
              aria-label="Playlist shortcut name"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              maxLength={100}
            />
          </label>
          <label>
            Apple Music playlist URL
            <Input
              aria-label="Apple Music playlist URL"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              maxLength={2000}
            />
          </label>
          <Button type="submit" disabled={busy}>
            Save playlist shortcut
          </Button>
        </form>
        {status && <p role="status">{status}</p>}
      </div>
    </section>
  );
}
