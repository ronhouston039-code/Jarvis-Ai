import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthProfileReady } from "deepspace";
import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { authenticatedFetch } from "../../jarvis/client";
import {
  controlAppleMusicPlayback,
  loadMusicKit,
  readAppleMusicPlayback,
  readScopedAppleMusicPlayback,
  subscribeAppleMusicPlayback,
  type AppleMusicPlaybackAction,
  type MusicKitInstance,
  type AppleMusicPlayback,
} from "../apple-music";
import "./now-playing.css";

function playbackTime(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

type NowPlayingProps = {
  vamp?: {
    supported: boolean;
    status: string | null;
    canReport: boolean;
    confirmPlaying: () => boolean;
    notPlaying: () => boolean;
  };
  onPlayVamp?: () => void;
};

export function NowPlaying({ vamp, onPlayVamp }: NowPlayingProps = {}) {
  const auth = useAuthProfileReady({ requireUser: true });
  const userId = auth.isReady && auth.isSignedIn ? auth.userId : null;
  const identity = useRef(userId);
  identity.current = userId;
  type View = {
    userId: string | null;
    playback: AppleMusicPlayback;
    setup: "loading" | "available" | "unavailable" | "failed";
    busy: boolean;
    message: string;
  };
  const emptyView = (owner: string | null): View => ({
    userId: owner,
    playback: readAppleMusicPlayback(null),
    setup: "loading",
    busy: false,
    message: "",
  });
  const [stored, setStored] = useState<View>(() => emptyView(null));
  // Hide a previous account's snapshot during render, before effect cleanup runs.
  const view = userId && stored.userId === userId ? stored : emptyView(userId);
  const { playback, setup, busy, message } = view;
  const session = useRef<{
    userId: string;
    music: MusicKitInstance | null;
    verify: () => Promise<MusicKitInstance | null>;
  } | null>(null);
  const [failedArtwork, setFailedArtwork] = useState<string | null>(null);

  useEffect(() => {
    setStored(emptyView(userId));
    setFailedArtwork(null);
    if (!userId) return;
    let active = true;
    let configurationAllowed = false;
    let music: MusicKitInstance | null = null;
    let lastOwnedMusic: MusicKitInstance | null = null;
    let pending: Promise<MusicKitInstance | null> | null = null;
    let unsubscribe = () => {};
    let timer: number | undefined;
    let configurationTimer: number | undefined;
    const abort = new AbortController();
    const current = () => active && identity.current === userId;
    const patch = (changes: Partial<View>) => {
      if (!current()) return;
      setStored((previous) => ({
        ...(previous.userId === userId ? previous : emptyView(userId)),
        ...changes,
        userId,
      }));
    };
    const clearPlayback = (nextSetup: View["setup"]) => {
      configurationAllowed = false;
      unsubscribe();
      unsubscribe = () => {};
      music = null;
      if (session.current?.userId === userId) session.current.music = null;
      patch({ playback: readAppleMusicPlayback(null), setup: nextSetup });
    };
    const update = () => {
      if (!current() || (document.hidden && music?.isAuthorized)) return;
      try {
        patch({
          playback: readScopedAppleMusicPlayback(
            music,
            userId,
            identity.current,
            configurationAllowed,
          ),
        });
      } catch {
        patch({
          playback: readAppleMusicPlayback(null),
          message: "Apple Music playback status is unavailable.",
        });
      }
    };
    const refreshConfiguration = (): Promise<MusicKitInstance | null> => {
      if (!current()) return Promise.resolve(null);
      if (pending) return pending;
      pending = (async () => {
        try {
          const response = await authenticatedFetch(
            "/api/jarvis/connections/apple-music/config",
            undefined,
            abort.signal,
          );
          const config = (await response.json()) as {
            available?: boolean;
            developerToken?: string;
          };
          if (!current()) return null;
          if (!response.ok || !config.available || !config.developerToken) {
            clearPlayback("unavailable");
            return null;
          }
          if (music) {
            configurationAllowed = true;
            patch({ setup: "available" });
            update();
            return music;
          }
          const sdk = await loadMusicKit();
          if (!current()) return null;
          let candidate: MusicKitInstance | undefined;
          try {
            candidate = sdk.getInstance();
          } catch {
            // MusicKit throws until its first configure call.
          }
          if (!candidate) {
            candidate = await sdk.configure({
              developerToken: config.developerToken,
              app: { name: "JARVIS", build: "1.0" },
            });
          }
          if (!current()) return null;
          music = candidate;
          lastOwnedMusic = music;
          configurationAllowed = true;
          if (session.current?.userId === userId) session.current.music = music;
          patch({ setup: "available" });
          unsubscribe = subscribeAppleMusicPlayback(music, update);
          update();
          return music;
        } catch {
          if (current()) clearPlayback("failed");
          return null;
        }
      })().finally(() => {
        pending = null;
      });
      return pending;
    };
    session.current = { userId, music: null, verify: refreshConfiguration };
    const visibility = () => {
      window.clearInterval(timer);
      window.clearInterval(configurationTimer);
      timer = undefined;
      configurationTimer = undefined;
      if (!document.hidden && current()) {
        void refreshConfiguration();
        timer = window.setInterval(update, 1000);
        configurationTimer = window.setInterval(() => {
          void refreshConfiguration();
        }, 30000);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      active = false;
      abort.abort();
      window.clearInterval(timer);
      window.clearInterval(configurationTimer);
      document.removeEventListener("visibilitychange", visibility);
      unsubscribe();
      if (identity.current !== userId) {
        try {
          lastOwnedMusic?.pause();
          void lastOwnedMusic?.unauthorize().catch(() => {});
        } catch {
          /* A revoked SDK may already be stopped. */
        }
      }
      if (session.current?.userId === userId) session.current = null;
    };
  }, [userId]);

  async function control(action: AppleMusicPlaybackAction) {
    const requested = session.current;
    if (busy || !requested || requested.userId !== userId) return;
    const current = () =>
      session.current === requested && identity.current === requested.userId;
    const patch = (changes: Partial<View>) => {
      if (current()) setStored((previous) => ({ ...previous, ...changes }));
    };
    patch({ busy: true, message: "" });
    try {
      const verified = await requested.verify();
      if (!current()) return;
      if (!verified) throw new Error("apple_music_configuration_unavailable");
      await controlAppleMusicPlayback(verified, action);
      patch({
        playback: readScopedAppleMusicPlayback(
          verified,
          requested.userId,
          identity.current,
          true,
        ),
      });
    } catch {
      patch({
        message:
          "Apple Music could not complete that command. Check your queue and connection.",
      });
    } finally {
      patch({ busy: false });
    }
  }

  const hasTrack =
    setup === "available" && playback.authorized && !!playback.title;
  const unavailableLabel =
    setup === "loading"
      ? "Checking Apple Music…"
      : setup === "unavailable"
        ? "Apple Music setup required"
        : setup === "failed"
          ? "Apple Music unavailable"
          : playback.authorized
            ? "No track queued"
            : "Apple Music not connected";

  return (
    <section
      className="hud-panel media-panel dashboard-now-playing"
      aria-label="Now Playing"
    >
      <h2>
        <Music size={18} />
        Now Playing
      </h2>
      <div className="dashboard-music-row">
        <div className="dashboard-music-art" aria-hidden="true">
          {hasTrack &&
          playback.artworkUrl &&
          playback.artworkUrl !== failedArtwork ? (
            <img
              src={playback.artworkUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setFailedArtwork(playback.artworkUrl)}
            />
          ) : (
            <Music size={24} />
          )}
        </div>
        <div className="dashboard-music-info">
          <p className="dashboard-music-title">
            {hasTrack ? playback.title : unavailableLabel}
          </p>
          <p className="dashboard-music-artist">
            {hasTrack
              ? playback.artist || "Apple Music"
              : playback.authorized
                ? "Choose music in Connections"
                : "Authorize playback in Connections"}
          </p>
        </div>
        {hasTrack && (
          <div className="dashboard-music-controls">
            <button
              type="button"
              disabled={busy || !session.current?.music?.skipToPreviousItem}
              aria-label="Previous track"
              onClick={() => void control("previous")}
            >
              <SkipBack size={18} />
            </button>
            <button
              className="dashboard-music-play"
              type="button"
              disabled={busy}
              aria-label={playback.playing ? "Pause music" : "Play music"}
              onClick={() => void control(playback.playing ? "pause" : "play")}
            >
              {playback.playing ? <Pause size={19} /> : <Play size={19} />}
            </button>
            <button
              type="button"
              disabled={busy || !session.current?.music?.skipToNextItem}
              aria-label="Next track"
              onClick={() => void control("next")}
            >
              <SkipForward size={18} />
            </button>
          </div>
        )}
      </div>
      {hasTrack && playback.duration > 0 && (
        <div className="dashboard-music-progress">
          <span>{playbackTime(playback.elapsed)}</span>
          <progress
            aria-label="Track progress"
            max={playback.duration}
            value={playback.elapsed}
          />
          <span>{playbackTime(playback.duration)}</span>
        </div>
      )}
      <Link
        className="hud-panel-action dashboard-music-connect"
        to="/connections?tab=music"
      >
        {playback.authorized ? "Open media controls" : "Connect Apple Music"}
      </Link>
      {message && (
        <p className="dashboard-music-message" role="status">
          {message}
        </p>
      )}
      {vamp?.supported && (
        <div className="dashboard-vamp-shortcut">
          <button
            type="button"
            aria-label="Review Play Vamp request"
            data-greeting-skip
            disabled={!onPlayVamp || !userId}
            onClick={onPlayVamp}
          >
            <Play size={13} aria-hidden="true" />
            Play Vamp
          </button>
          {vamp.status && (
            <p className="dashboard-vamp-status" role="status">
              {vamp.status}
            </p>
          )}
          {vamp.status?.startsWith("Playing") && (
            <p className="dashboard-vamp-reported">
              User reported · device playback not verified
            </p>
          )}
          {vamp.canReport && (
            <div className="dashboard-vamp-report-actions">
              <button
                type="button"
                data-greeting-skip
                disabled={!userId || !vamp.canReport}
                onClick={() => {
                  if (userId && vamp.canReport) vamp.confirmPlaying();
                }}
              >
                Confirm Playing
              </button>
              <button
                type="button"
                data-greeting-skip
                disabled={!userId || !vamp.canReport}
                onClick={() => {
                  if (userId && vamp.canReport) vamp.notPlaying();
                }}
              >
                Not Playing
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
