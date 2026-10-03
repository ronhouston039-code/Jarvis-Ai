import { useEffect, useState, useRef } from "react";
import { authenticatedFetch } from "../jarvis/client";
import {
  loadMusicKit,
  openAppleMusic,
  type MusicKitInstance,
  type MusicItem,
} from "./apple-music";
import { Button, Input } from "./ui";
export function AppleMusicConnect() {
  const music = useRef<MusicKitInstance | null>(null);
  const [nowPlaying, setNowPlaying] = useState<{
    title: string;
    artist: string;
  } | null>(null);
  const [playing, setPlaying] = useState(false);

  const [playlistDialog, setPlaylistDialog] = useState(false);
  const [playlistName, setPlaylistName] = useState("Saturday Night");
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  const [connected, setConnected] = useState(false);
  const [contextAllowed, setContextAllowed] = useState(false);
  const contextConsent = useRef(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<MusicItem[]>([]);
  const [recent, setRecent] = useState<MusicItem[]>([]);
  const [storefront, setStorefront] = useState("us");
  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => {
      const item = music.current?.nowPlayingItem;
      if (item?.title)
        setNowPlaying({ title: item.title, artist: item.artistName ?? "" });
      if (typeof music.current?.isPlaying === "boolean")
        setPlaying(music.current.isPlaying);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connected]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await authenticatedFetch(
          "/api/jarvis/connections/apple-music/config",
        );
        const config = (await response.json()) as {
          available?: boolean;
          developerToken?: string;
        };
        if (!active) return;
        if (!response.ok || !config.available || !config.developerToken) {
          setConfigured(false);
          return;
        }
        setConfigured(true);
        const sdk = await loadMusicKit();
        const instance = await sdk.configure({
          developerToken: config.developerToken,
          app: { name: "JARVIS", build: "1.0" },
        });
        if (active) {
          music.current = instance;
          setConnected(instance.isAuthorized);
          setReady(true);
        }
      } catch {
        if (active)
          setStatus("Apple Music could not load. Refresh and try again.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function authorize() {
    const instance = music.current;
    if (!instance || !ready) return;
    setBusy(true);
    setStatus("");
    try {
      // Called directly from the Continue button so Apple can open its authorization prompt.
      await instance.authorize();
      if (!instance.isAuthorized) throw new Error("authorization_incomplete");
      setConnected(true);
      setConsent(false);
      try {
        const result = await instance.api.music("/v1/me/storefront");
        const country = result.data?.data?.[0]?.id;
        if (country && /^[a-z]{2}$/.test(country)) setStorefront(country);
      } catch {
        /* Use the public US catalog until the account storefront is available. */
      }
    } catch {
      setConnected(false);
      setStatus(
        "Apple Music authorization did not complete. You can try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    try {
      music.current?.pause();
      await music.current?.unauthorize();
      setConnected(false);
      contextConsent.current = false;
      setContextAllowed(false);
      setRecent([]);
      setTracks([]);
      setNowPlaying(null);
      setPlaying(false);
      setPlaylistDialog(false);
      setStatus("Apple Music disconnected.");
    } catch {
      setStatus("Apple could not disconnect. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function search() {
    if (!connected || !music.current) return;
    setBusy(true);
    setStatus("");
    try {
      const result = await music.current.api.music(
        `/v1/catalog/${storefront}/search`,
        { queryParameters: { term: query, types: "songs", limit: 8 } },
      );
      setTracks(result.data?.results?.songs?.data ?? []);
    } catch {
      setStatus("Apple Music search is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }
  async function play(id: string) {
    if (!connected || !music.current) return;
    setBusy(true);
    setStatus("");
    try {
      await music.current.setQueue({
        songs: [
          id,
          ...tracks.filter((track) => track.id !== id).map((track) => track.id),
        ],
      });
      await music.current.play();
      setStatus("Playback started.");
    } catch {
      setStatus(
        "Apple could not start playback. Check your subscription and media permissions.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function recentContext() {
    if (!connected || !contextAllowed || !music.current) return;
    setBusy(true);
    setStatus("");
    try {
      const result = await music.current.api.music("/v1/me/recent/played");
      if (contextConsent.current && music.current?.isAuthorized)
        setRecent(result.data?.data ?? []);
    } catch {
      setStatus("Listening context could not be retrieved.");
    } finally {
      setBusy(false);
    }
  }
  async function skip(direction: "previous" | "next") {
    if (!music.current || !connected) return;
    setBusy(true);
    setStatus("");
    try {
      const handler =
        direction === "previous"
          ? music.current.skipToPreviousItem
          : music.current.skipToNextItem;
      if (!handler) throw new Error("not_supported");
      await handler.call(music.current);
      const item = music.current.nowPlayingItem;
      if (item?.title)
        setNowPlaying({ title: item.title, artist: item.artistName ?? "" });
    } catch {
      setStatus("No track is available in that direction.");
    } finally {
      setBusy(false);
    }
  }
  async function togglePlayback() {
    if (!music.current) return;
    try {
      if (playing) {
        music.current.pause();
        setPlaying(false);
      } else {
        await music.current.play();
        setPlaying(true);
      }
    } catch {
      setStatus("Apple could not resume playback.");
    }
  }
  async function createPlaylist() {
    const name = playlistName.trim();
    if (
      !connected ||
      !music.current ||
      !playlistDialog ||
      !name ||
      name.length > 100 ||
      busy
    )
      return;
    setBusy(true);
    setStatus("");
    try {
      const result = await music.current.api.music("/v1/me/library/playlists", {
        fetchOptions: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attributes: { name } }),
        },
      });
      if (!result.data?.data?.[0]?.id)
        throw new Error("creation_not_confirmed");
      setPlaylistDialog(false);
      setStatus(`Created playlist “${name}” with 0 songs.`);
    } catch {
      setStatus(
        "Apple did not confirm playlist creation. Check your library before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="apple-music-connect personal-card">
      <div style={{ width: "100%" }}>
        <h2>Apple Music connection</h2>
        <Button variant="outline" onClick={() => openAppleMusic()}>
          Open Apple Music
        </Button>
        {configured === null && !status && <p>Checking Apple Music setup…</p>}
        {configured === false && (
          <p>
            Direct Apple Music connection needs a MusicKit developer token
            configured by the JARVIS owner. Your iPhone Shortcuts controls
            remain available below.
          </p>
        )}
        {status && <p role="status">{status}</p>}
        {configured && !connected && !consent && (
          <Button disabled={!ready || busy} onClick={() => setConsent(true)}>
            Connect Apple Music
          </Button>
        )}
        {consent && !connected && (
          <div role="dialog" aria-label="Apple Music permissions">
            <p>
              JARVIS will be able to play music and, if you allow it below,
              access your listening context. JARVIS cannot change your library
              or playlists without confirmation. Creating an empty playlist
              requires a separate review and your tap on Create playlist.
            </p>
            <p>
              Apple handles authorization. Your Apple password and music user
              token are not sent to the JARVIS backend.
            </p>
            <label>
              <input
                type="checkbox"
                checked={contextAllowed}
                onChange={(e) => {
                  contextConsent.current = e.target.checked;
                  setContextAllowed(e.target.checked);
                }}
              />{" "}
              Allow listening context in this browser
            </label>
            <div className="connection-actions">
              <Button
                disabled={!ready || busy}
                onClick={() => void authorize()}
              >
                Continue with Apple Music
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setConsent(false);
                  contextConsent.current = false;
                  setContextAllowed(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {connected && (
          <>
            <p role="status">Connected to Apple Music</p>
            <p>
              Play music, search the catalog, and access personal listening
              context if you allow it. Playlist changes always require
              confirmation.
            </p>
            {nowPlaying && (
              <section className="music-now-playing">
                <p>
                  ♪ {nowPlaying.title}
                  {nowPlaying.artist ? ` — ${nowPlaying.artist}` : ""}
                </p>
                <div className="connection-actions">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void skip("previous")}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void togglePlayback()}
                  >
                    {playing ? "Pause" : "Play"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void skip("next")}
                  >
                    Next
                  </Button>
                </div>
              </section>
            )}
            <p className="muted text-sm">
              Apple does not share your Apple ID account name with JARVIS.
              Playback uses your Apple Music subscription.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
            >
              <label>
                Find music
                <Input
                  aria-label="Find Apple Music tracks"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  required
                  maxLength={200}
                />
              </label>
              <Button disabled={busy} type="submit">
                Search Apple Music
              </Button>
            </form>
            {tracks.map((track) => (
              <div className="connection-actions" key={track.id}>
                <span>
                  {track.attributes?.name} · {track.attributes?.artistName}
                </span>
                <Button disabled={busy} onClick={() => void play(track.id)}>
                  Play {track.attributes?.name ?? "track"}
                </Button>
              </div>
            ))}
            <div className="connection-actions">
              <Button variant="outline" onClick={() => music.current?.pause()}>
                Pause music
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setPlaylistDialog(true)}
              >
                New playlist
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void disconnect()}
              >
                Disconnect Apple Music
              </Button>
            </div>
            <label>
              <input
                type="checkbox"
                checked={contextAllowed}
                onChange={(e) => {
                  contextConsent.current = e.target.checked;
                  setContextAllowed(e.target.checked);
                  if (!e.target.checked) setRecent([]);
                }}
              />{" "}
              Allow listening context in this browser
            </label>
            {contextAllowed && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void recentContext()}
              >
                Show recently played
              </Button>
            )}
            {recent.map((item) => (
              <p key={item.id}>
                {item.attributes?.name} · {item.attributes?.artistName}
              </p>
            ))}
            <p className="muted text-sm">
              Listening context stays in this browser and is not sent to your AI
              provider.
            </p>
            {playlistDialog && (
              <div
                role="dialog"
                aria-label="Create playlist confirmation"
                className="playlist-review"
              >
                <h3>Create playlist?</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void createPlaylist();
                  }}
                >
                  <label>
                    Name
                    <Input
                      aria-label="Playlist name"
                      value={playlistName}
                      onChange={(e) => setPlaylistName(e.target.value)}
                      maxLength={100}
                      required
                      disabled={busy}
                    />
                  </label>
                  <p>Songs: 0 initially</p>
                  <p>Apple Music account: connected account</p>
                  <div className="connection-actions">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setPlaylistDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={busy || !playlistName.trim()}
                    >
                      Create playlist
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
