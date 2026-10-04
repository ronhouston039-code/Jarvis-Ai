export type MusicItem = {
  id: string;
  type: string;
  attributes?: { name?: string; artistName?: string };
};
export type MusicKitInstance = {
  isAuthorized: boolean;
  isPlaying?: boolean;
  nowPlayingItem?: {
    id?: string;
    container?: { id?: string; type?: string };
    title?: string;
    artistName?: string;
    artwork?: { url?: string };
  };
  currentPlaybackTime?: number;
  currentPlaybackDuration?: number;
  addEventListener?: (name: string, listener: () => void) => void;
  removeEventListener?: (name: string, listener: () => void) => void;
  skipToPreviousItem?: () => Promise<unknown>;
  skipToNextItem?: () => Promise<unknown>;
  authorize: () => Promise<string>;
  unauthorize: () => Promise<void>;
  setQueue: (queue: { song?: string; songs?: string[] }) => Promise<unknown>;
  play: () => Promise<unknown>;
  pause: () => void;
  api: {
    music: (
      path: string,
      options?: {
        queryParameters?: Record<string, string | number>;
        fetchOptions?: {
          method: "POST";
          headers?: Record<string, string>;
          body: string;
        };
      },
    ) => Promise<{
      data?: {
        data?: MusicItem[];
        results?: { songs?: { data?: MusicItem[] } };
      };
    }>;
  };
};
type MusicKitGlobal = {
  configure: (config: {
    developerToken: string;
    app: { name: string; build: string };
  }) => Promise<MusicKitInstance>;
  getInstance: () => MusicKitInstance;
};
declare global {
  interface Window {
    MusicKit?: MusicKitGlobal;
  }
}
let loading: Promise<MusicKitGlobal> | undefined;
export function loadMusicKit(): Promise<MusicKitGlobal> {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    let settled = false;
    const script = document.createElement("script");
    script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    script.async = true;
    const timer = window.setTimeout(() => finish(false), 15000);
    function finish(ok: boolean) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      document.removeEventListener("musickitloaded", ready);
      if (ok && window.MusicKit) resolve(window.MusicKit);
      else {
        loading = undefined;
        script.remove();
        reject(new Error("musickit_unavailable"));
      }
    }
    const ready = () => finish(true);
    document.addEventListener("musickitloaded", ready, { once: true });
    script.onerror = () => finish(false);
    script.onload = () => {
      if (window.MusicKit) finish(true);
    };
    document.head.appendChild(script);
  });
  return loading;
}
export async function disconnectAppleMusic() {
  try {
    const music = window.MusicKit?.getInstance();
    if (music) {
      music.pause();
      await music.unauthorize();
    }
  } catch {
    /* Logout must still complete if Apple is unavailable. */
  }
}

export function openAppleMusic(url = "https://music.apple.com/"): void {
  const destination = new URL(url);
  if (
    destination.protocol !== "https:" ||
    destination.hostname !== "music.apple.com"
  )
    throw new Error("invalid_apple_music_url");
  window.open(destination.toString(), "_blank", "noopener,noreferrer");
}

export type AppleMusicPlayback = {
  authorized: boolean;
  playing: boolean;
  title: string;
  artist: string;
  artworkUrl: string | null;
  elapsed: number;
  duration: number;
};

export function appleMusicArtwork(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const image = new URL(
      url
        .replace(/\{w\}/g, "160")
        .replace(/\{h\}/g, "160")
        .replace(/\{f\}/g, "jpg"),
    );
    if (
      image.protocol !== "https:" ||
      image.username ||
      image.password ||
      image.port ||
      !(
        image.hostname.endsWith(".mzstatic.com") ||
        image.hostname.endsWith(".apple.com")
      )
    )
      return null;
    return image.toString();
  } catch {
    return null;
  }
}

/** Current browser playback only: no library/history API or token access. */
export function readAppleMusicPlayback(
  music: MusicKitInstance | null,
): AppleMusicPlayback {
  const empty: AppleMusicPlayback = {
    authorized: false,
    playing: false,
    title: "",
    artist: "",
    artworkUrl: null,
    elapsed: 0,
    duration: 0,
  };
  if (!music?.isAuthorized) return empty;
  const item = music.nowPlayingItem;
  const duration = Number.isFinite(music.currentPlaybackDuration)
    ? Math.max(0, music.currentPlaybackDuration!)
    : 0;
  const time = Number.isFinite(music.currentPlaybackTime)
    ? Math.max(0, music.currentPlaybackTime!)
    : 0;
  return {
    authorized: true,
    playing: music.isPlaying === true,
    title:
      typeof item?.title === "string" ? item.title.trim().slice(0, 200) : "",
    artist:
      typeof item?.artistName === "string"
        ? item.artistName.trim().slice(0, 200)
        : "",
    artworkUrl: appleMusicArtwork(item?.artwork?.url),
    elapsed: duration > 0 ? Math.min(time, duration) : time,
    duration,
  };
}

export function readScopedAppleMusicPlayback(
  music: MusicKitInstance | null,
  sessionUserId: string | null,
  currentUserId: string | null,
  configurationAllowed: boolean,
): AppleMusicPlayback {
  if (
    !currentUserId ||
    sessionUserId !== currentUserId ||
    !configurationAllowed
  )
    return readAppleMusicPlayback(null);
  return readAppleMusicPlayback(music);
}

// Public playlist identity supplied by the user; this is not an authorization token.
export const VAMP_PLAYLIST_ID = "pl.u-JPAZbAPTDzXod7v";
export type VampPlaybackObservation = {
  userId: string;
  observedAt: number;
  authorized: boolean;
  playing: boolean;
  itemId: string | null;
  playlistId: string | null;
};
function validMusicItemId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(value)
  );
}

/** Read the current SDK item's container, never infer its playlist from a title. */
export function readScopedVampPlayback(
  music: MusicKitInstance | null,
  sessionUserId: string | null,
  currentUserId: string | null,
  configurationAllowed: boolean,
  observedAt = Date.now(),
): VampPlaybackObservation | null {
  if (
    !currentUserId ||
    sessionUserId !== currentUserId ||
    !configurationAllowed ||
    music?.isAuthorized !== true
  )
    return null;
  const item = music.nowPlayingItem;
  const container = item?.container;
  return {
    userId: currentUserId,
    observedAt,
    authorized: true,
    playing: music.isPlaying === true,
    itemId: validMusicItemId(item?.id) ? item.id : null,
    playlistId:
      container?.type === "playlists" && validMusicItemId(container.id)
        ? container.id
        : null,
  };
}

/** MusicKit only verifies this browser's playback, not native Apple Music output. */
export function isVerifiedVampPlayback(
  observation: VampPlaybackObservation | null,
): boolean {
  return (
    !!observation &&
    observation.authorized === true &&
    observation.playing === true &&
    Number.isFinite(observation.observedAt) &&
    validMusicItemId(observation.itemId) &&
    observation.playlistId === VAMP_PLAYLIST_ID
  );
}

export type AppleMusicPlaybackAction = "previous" | "play" | "pause" | "next";

export async function controlAppleMusicPlayback(
  music: MusicKitInstance,
  action: AppleMusicPlaybackAction,
): Promise<void> {
  if (!music.isAuthorized) throw new Error("apple_music_not_authorized");
  if (!music.nowPlayingItem?.title) throw new Error("apple_music_queue_empty");
  switch (action) {
    case "previous":
      if (!music.skipToPreviousItem)
        throw new Error("apple_music_previous_unavailable");
      await music.skipToPreviousItem();
      break;
    case "next":
      if (!music.skipToNextItem)
        throw new Error("apple_music_next_unavailable");
      await music.skipToNextItem();
      break;
    case "play":
      await music.play();
      break;
    case "pause":
      await music.pause();
      break;
    default:
      throw new Error("apple_music_command_unavailable");
  }
}

/** Older SDKs fall back to the card's bounded, foreground-only polling. */
export function subscribeAppleMusicPlayback(
  music: MusicKitInstance,
  update: () => void,
): () => void {
  if (!music.addEventListener || !music.removeEventListener) return () => {};
  const registered: string[] = [];
  for (const event of [
    "authorizationStatusDidChange",
    "nowPlayingItemDidChange",
    "playbackStateDidChange",
    "playbackTimeDidChange",
  ]) {
    try {
      music.addEventListener(event, update);
      registered.push(event);
    } catch {
      // Some MusicKit versions omit an event; foreground polling remains available.
    }
  }
  return () => {
    for (const event of registered.splice(0)) {
      try {
        music.removeEventListener?.(event, update);
      } catch {
        // A revoked SDK instance may already have removed its listeners.
      }
    }
  };
}
