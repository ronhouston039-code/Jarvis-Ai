export type MusicItem = {
  id: string;
  type: string;
  attributes?: { name?: string; artistName?: string };
};
export type MusicKitInstance = {
  isAuthorized: boolean;
  isPlaying?: boolean;
  nowPlayingItem?: { title?: string; artistName?: string };
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
