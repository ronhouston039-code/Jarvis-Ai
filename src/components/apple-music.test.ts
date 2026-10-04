import { describe, expect, it, vi } from "vitest";
import {
  appleMusicArtwork,
  controlAppleMusicPlayback,
  readAppleMusicPlayback,
  readScopedAppleMusicPlayback,
  subscribeAppleMusicPlayback,
  type MusicKitInstance,
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
