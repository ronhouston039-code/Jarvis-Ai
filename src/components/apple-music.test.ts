import { describe, expect, it, vi } from "vitest";
import {
  appleMusicArtwork,
  controlAppleMusicPlayback,
  isVerifiedVampPlayback,
  readAppleMusicPlayback,
  readScopedAppleMusicPlayback,
  readScopedVampPlayback,
  subscribeAppleMusicPlayback,
  VAMP_PLAYLIST_ID,
  type MusicKitInstance,
  type VampPlaybackObservation,
} from "./apple-music";

function mockMusic(): MusicKitInstance {
  return {
    isAuthorized: true,
    isPlaying: true,
    nowPlayingItem: {
      title: "Midnight City",
      artistName: "M83",
      artwork: {
        url: "https://is1-ssl.mzstatic.com/image/thumb/Music/{w}x{h}bb.{f}",
      },
    },
    currentPlaybackTime: 84,
    currentPlaybackDuration: 258,
    authorize: vi.fn(async () => "unused-test-token"),
    unauthorize: vi.fn(async () => {}),
    setQueue: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
    pause: vi.fn(() => {}),
    skipToPreviousItem: vi.fn(async () => {}),
    skipToNextItem: vi.fn(async () => {}),
    api: { music: vi.fn(async () => ({ data: { data: [] } })) },
  };
}

describe("authorized dashboard Apple Music playback", () => {
  it("reads actual current playback without authorizing or querying listening context", () => {
    const music = mockMusic();
    expect(readAppleMusicPlayback(music)).toEqual({
      authorized: true,
      playing: true,
      title: "Midnight City",
      artist: "M83",
      artworkUrl:
        "https://is1-ssl.mzstatic.com/image/thumb/Music/160x160bb.jpg",
      elapsed: 84,
      duration: 258,
    });
    expect(music.authorize).not.toHaveBeenCalled();
    expect(music.api.music).not.toHaveBeenCalled();
  });

  it("does not access track metadata after authorization is revoked", () => {
    const music = mockMusic();
    music.isAuthorized = false;
    const readItem = vi.fn(() => {
      throw new Error("private metadata read");
    });
    Object.defineProperty(music, "nowPlayingItem", { get: readItem });
    expect(readAppleMusicPlayback(music)).toEqual(readAppleMusicPlayback(null));
    expect(readItem).not.toHaveBeenCalled();
  });

  it("isolates snapshots from changed users and revoked server configuration", () => {
    const music = mockMusic();
    const readItem = vi.fn(() => {
      throw new Error("private metadata read");
    });
    Object.defineProperty(music, "nowPlayingItem", { get: readItem });
    const empty = readAppleMusicPlayback(null);
    expect(
      readScopedAppleMusicPlayback(music, "first-user", "second-user", true),
    ).toEqual(empty);
    expect(
      readScopedAppleMusicPlayback(music, "first-user", null, true),
    ).toEqual(empty);
    expect(
      readScopedAppleMusicPlayback(music, "first-user", "first-user", false),
    ).toEqual(empty);
    expect(readItem).not.toHaveBeenCalled();
  });

  it("clamps invalid and out-of-range provider progress instead of inventing a timeline", () => {
    const music = mockMusic();
    music.currentPlaybackTime = 400;
    expect(readAppleMusicPlayback(music).elapsed).toBe(258);
    music.currentPlaybackDuration = Number.NaN;
    music.currentPlaybackTime = Number.POSITIVE_INFINITY;
    const playback = readAppleMusicPlayback(music);
    expect(playback.elapsed).toBe(0);
    expect(playback.duration).toBe(0);
    music.currentPlaybackTime = -9;
    expect(readAppleMusicPlayback(music).elapsed).toBe(0);
  });

  it("accepts only HTTPS Apple artwork without credentials or foreign hosts", () => {
    for (const url of [
      "http://is1-ssl.mzstatic.com/cover.jpg",
      "https://is1-ssl.mzstatic.com.evil.example/cover.jpg",
      "https://user:password@is1-ssl.mzstatic.com/cover.jpg",
      "https://192.168.1.89/cover.jpg",
      "data:image/png;base64,dGVzdA==",
    ])
      expect(appleMusicArtwork(url)).toBeNull();
    expect(appleMusicArtwork(undefined)).toBeNull();
  });

  it("maps direct controls to the existing SDK without authorizing or changing the queue", async () => {
    const music = mockMusic();
    for (const action of ["previous", "pause", "play", "next"] as const) {
      await controlAppleMusicPlayback(music, action);
    }
    expect(music.skipToPreviousItem).toHaveBeenCalledOnce();
    expect(music.pause).toHaveBeenCalledOnce();
    expect(music.play).toHaveBeenCalledOnce();
    expect(music.skipToNextItem).toHaveBeenCalledOnce();
    expect(music.authorize).not.toHaveBeenCalled();
    expect(music.setQueue).not.toHaveBeenCalled();
    expect(music.api.music).not.toHaveBeenCalled();
  });

  it("blocks revoked authorization and empty queues before any playback command", async () => {
    const music = mockMusic();
    music.isAuthorized = false;
    await expect(controlAppleMusicPlayback(music, "pause")).rejects.toThrow(
      "not_authorized",
    );
    expect(music.pause).not.toHaveBeenCalled();
    music.isAuthorized = true;
    music.nowPlayingItem = undefined;
    await expect(controlAppleMusicPlayback(music, "play")).rejects.toThrow(
      "queue_empty",
    );
    expect(music.play).not.toHaveBeenCalled();
  });

  it("propagates playback failure and reflects provider state rather than optimistic success", async () => {
    const music = mockMusic();
    music.isPlaying = false;
    await controlAppleMusicPlayback(music, "play");
    expect(readAppleMusicPlayback(music).playing).toBe(false);
    music.play = vi.fn(async () => {
      throw new Error("subscription unavailable");
    });
    await expect(controlAppleMusicPlayback(music, "play")).rejects.toThrow(
      "subscription unavailable",
    );
    expect(readAppleMusicPlayback(music).playing).toBe(false);
  });

  it("removes every successful event listener and tolerates unsupported SDK events", () => {
    const music = mockMusic();
    const update = vi.fn();
    music.addEventListener = vi.fn((name: string) => {
      if (name === "playbackTimeDidChange")
        throw new Error("unsupported event");
    });
    music.removeEventListener = vi.fn();
    const dispose = subscribeAppleMusicPlayback(music, update);
    expect(music.addEventListener).toHaveBeenCalledTimes(4);
    dispose();
    expect(music.removeEventListener).toHaveBeenCalledTimes(3);
    expect(music.removeEventListener).toHaveBeenCalledWith(
      "authorizationStatusDidChange",
      update,
    );
    expect(music.removeEventListener).toHaveBeenCalledWith(
      "nowPlayingItemDidChange",
      update,
    );
    expect(music.removeEventListener).toHaveBeenCalledWith(
      "playbackStateDidChange",
      update,
    );
    dispose();
    expect(music.removeEventListener).toHaveBeenCalledTimes(3);
  });
});

describe("verified VAMP playback", () => {
  const observedAt = Date.UTC(2026, 9, 4, 12);
  const userId = "music-owner";

  function mockVampMusic(): MusicKitInstance {
    const music = mockMusic();
    music.nowPlayingItem = {
      ...music.nowPlayingItem,
      id: "song-123",
      container: { id: VAMP_PLAYLIST_ID, type: "playlists" },
    };
    return music;
  }

  function observe(music: MusicKitInstance | null) {
    return readScopedVampPlayback(music, userId, userId, true, observedAt);
  }

  it("verifies the authorized user's active item in the exact VAMP playlist", () => {
    const music = mockVampMusic();
    const observation = observe(music);
    expect(observation).toEqual({
      userId,
      observedAt,
      authorized: true,
      playing: true,
      itemId: "song-123",
      playlistId: VAMP_PLAYLIST_ID,
    });
    expect(isVerifiedVampPlayback(observation)).toBe(true);
  });

  it.each([
    {
      reason: "revoked authorization",
      authorized: false,
      sessionUserId: userId,
      currentUserId: userId,
      configurationAllowed: true,
    },
    {
      reason: "a different current user",
      authorized: true,
      sessionUserId: userId,
      currentUserId: "other-user",
      configurationAllowed: true,
    },
    {
      reason: "no current user",
      authorized: true,
      sessionUserId: userId,
      currentUserId: null,
      configurationAllowed: true,
    },
    {
      reason: "no session user",
      authorized: true,
      sessionUserId: null,
      currentUserId: userId,
      configurationAllowed: true,
    },
    {
      reason: "disabled configuration",
      authorized: true,
      sessionUserId: userId,
      currentUserId: userId,
      configurationAllowed: false,
    },
  ])("does not read private track metadata with $reason", (scope) => {
    const music = mockVampMusic();
    music.isAuthorized = scope.authorized;
    const readItem = vi.fn(() => {
      throw new Error("private metadata read");
    });
    Object.defineProperty(music, "nowPlayingItem", { get: readItem });
    const observation = readScopedVampPlayback(
      music,
      scope.sessionUserId,
      scope.currentUserId,
      scope.configurationAllowed,
      observedAt,
    );
    expect(observation).toBeNull();
    expect(isVerifiedVampPlayback(observation)).toBe(false);
    expect(readItem).not.toHaveBeenCalled();
  });

  it.each([false, undefined, "true", 1])(
    "rejects playback unless the provider reports boolean true (%s)",
    (playing) => {
      const music = mockVampMusic();
      music.isPlaying = playing as MusicKitInstance["isPlaying"];
      expect(isVerifiedVampPlayback(observe(music))).toBe(false);
    },
  );

  it("rejects an unavailable SDK and a queue with no active item", () => {
    expect(observe(null)).toBeNull();
    expect(isVerifiedVampPlayback(observe(null))).toBe(false);
    const music = mockVampMusic();
    music.nowPlayingItem = undefined;
    expect(isVerifiedVampPlayback(observe(music))).toBe(false);
  });

  it("does not infer VAMP playback from a song title or a shared song ID", () => {
    const music = mockVampMusic();
    music.nowPlayingItem = { id: "song-123", title: "Vamp" };
    expect(isVerifiedVampPlayback(observe(music))).toBe(false);
    music.nowPlayingItem.container = {
      id: "pl.other-playlist",
      type: "playlists",
    };
    expect(isVerifiedVampPlayback(observe(music))).toBe(false);
    music.nowPlayingItem.container.id = `${VAMP_PLAYLIST_ID}-other`;
    expect(isVerifiedVampPlayback(observe(music))).toBe(false);
  });

  it.each([undefined, "", "song with spaces", "../song", "x".repeat(201), 123])(
    "rejects a missing or malformed song ID (%s)",
    (id) => {
      const music = mockVampMusic();
      music.nowPlayingItem!.id = id as string | undefined;
      expect(isVerifiedVampPlayback(observe(music))).toBe(false);
    },
  );

  it.each([
    undefined,
    {},
    { id: "", type: "playlists" },
    { id: "playlist with spaces", type: "playlists" },
    { id: "../playlist", type: "playlists" },
    { id: "x".repeat(201), type: "playlists" },
    { id: 123, type: "playlists" },
    { id: VAMP_PLAYLIST_ID },
    { id: VAMP_PLAYLIST_ID, type: "albums" },
    { id: VAMP_PLAYLIST_ID, type: "playlist" },
  ])("rejects an absent or invalid playlist container (%j)", (container) => {
    const music = mockVampMusic();
    music.nowPlayingItem!.container = container as NonNullable<
      MusicKitInstance["nowPlayingItem"]
    >["container"];
    expect(isVerifiedVampPlayback(observe(music))).toBe(false);
  });

  it("only observes playback without authorizing, changing queues, or accessing APIs", () => {
    const music = mockVampMusic();
    const api = music.api;
    const readApi = vi.fn(() => {
      throw new Error("listening API access");
    });
    Object.defineProperty(music, "api", { get: readApi });
    expect(isVerifiedVampPlayback(observe(music))).toBe(true);
    expect(music.authorize).not.toHaveBeenCalled();
    expect(music.unauthorize).not.toHaveBeenCalled();
    expect(music.setQueue).not.toHaveBeenCalled();
    expect(music.play).not.toHaveBeenCalled();
    expect(music.pause).not.toHaveBeenCalled();
    expect(readApi).not.toHaveBeenCalled();
    expect(api.music).not.toHaveBeenCalled();
  });

  it.each([
    { observedAt: Number.NaN },
    { observedAt: Number.POSITIVE_INFINITY },
    { observedAt: Number.NEGATIVE_INFINITY },
    { observedAt: undefined },
    { authorized: false },
    { authorized: "true" },
    { authorized: 1 },
    { playing: false },
    { playing: "true" },
    { playing: 1 },
    { itemId: null },
    { itemId: "song with spaces" },
    { playlistId: null },
    { playlistId: "pl.other-playlist" },
  ])("rejects invalid observations (%j)", (invalid) => {
    const observation = {
      ...observe(mockVampMusic()),
      ...invalid,
    } as VampPlaybackObservation;
    expect(isVerifiedVampPlayback(observation)).toBe(false);
  });
});
