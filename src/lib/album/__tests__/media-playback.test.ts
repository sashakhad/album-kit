import { afterEach, describe, expect, it, vi } from 'vitest';

import { PLAYER_SHELL_CSP } from '@/lib/album/content-security';
import {
  elementAttempts,
  formatPlaybackFailure,
  policiesAllow,
  startTakePlayback,
} from '@/lib/album/media-playback';

const STREAM = 'https://cdn1.suno.ai/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4';
const VIEWER_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src blob: data:; connect-src https:; base-uri 'none'";
const PREVIOUS_SHELL_CSP =
  "default-src 'none'; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; media-src 'self' file: https://*.suno.ai; base-uri 'none'; form-action 'none'";

describe('sandboxed attachment playback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets a blob fallback through the viewer policy that blocks remote media elements', () => {
    const blobUrl = 'blob:null/11111111-1111-1111-1111-111111111111';
    expect(policiesAllow([VIEWER_CSP], 'media-src', STREAM)).toBe(false);
    expect(policiesAllow([PREVIOUS_SHELL_CSP, VIEWER_CSP], 'connect-src', STREAM)).toBe(false);
    expect(policiesAllow([PREVIOUS_SHELL_CSP, VIEWER_CSP], 'media-src', blobUrl)).toBe(false);
    expect(policiesAllow([PLAYER_SHELL_CSP, VIEWER_CSP], 'connect-src', STREAM)).toBe(true);
    expect(policiesAllow([PLAYER_SHELL_CSP, VIEWER_CSP], 'media-src', blobUrl)).toBe(true);
    expect(policiesAllow([PLAYER_SHELL_CSP], 'media-src', STREAM)).toBe(true);
    expect(policiesAllow([PLAYER_SHELL_CSP], 'connect-src', 'https://evil.example/clip.mp4')).toBe(
      false
    );
    expect(
      policiesAllow([PLAYER_SHELL_CSP], 'media-src', 'https://cdn1.suno.ai.evil/clip.mp4')
    ).toBe(false);
    expect(policiesAllow([PLAYER_SHELL_CSP], 'media-src', 'https://cdn12.suno.ai/clip.mp3')).toBe(
      true
    );
  });

  it('tries the matching element before a cross-origin and blob fallback', () => {
    expect(elementAttempts(STREAM)[0]).toEqual({ tag: 'video', crossOrigin: false });
    expect(elementAttempts('https://cdn1.suno.ai/clip.mp3')[0]).toEqual({
      tag: 'audio',
      crossOrigin: false,
    });
  });

  it('plays a fetched blob when the remote element is rejected by a URL safety check', async () => {
    const { audio, video } = mountMedia();
    const safety = {
      code: 4,
      message: 'MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check',
    };
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(
      this: HTMLMediaElement
    ) {
      if (this.getAttribute('src')?.startsWith('blob:') === true) return Promise.resolve();
      Object.defineProperty(this, 'error', { configurable: true, value: safety });
      this.dispatchEvent(new Event('error'));
      return Promise.reject(new DOMException('No supported source', 'NotSupportedError'));
    });
    const fetchImpl = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        })
    );
    const onPlaying = vi.fn();
    const onFailure = vi.fn();
    startTakePlayback({
      url: STREAM,
      audio,
      video,
      buffered: null,
      fetchImpl,
      listener: { onPlaying, onFailure, onNeedsGesture: vi.fn() },
      onBuffer: vi.fn(),
    });

    await vi.waitFor(() => expect(onPlaying).toHaveBeenCalled());
    expect(onFailure).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(video.getAttribute('src')?.startsWith('blob:')).toBe(true);
  });

  it('reports the MediaError code and the URL when the stream cannot be buffered', async () => {
    const { audio, video } = mountMedia();
    const safety = {
      code: 4,
      message: 'MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check',
    };
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(
      this: HTMLMediaElement
    ) {
      Object.defineProperty(this, 'error', { configurable: true, value: safety });
      this.dispatchEvent(new Event('error'));
      return Promise.reject(new DOMException('No supported source', 'NotSupportedError'));
    });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const onFailure = vi.fn();
    startTakePlayback({
      url: STREAM,
      audio,
      video,
      buffered: null,
      fetchImpl,
      listener: { onPlaying: vi.fn(), onFailure, onNeedsGesture: vi.fn() },
      onBuffer: vi.fn(),
    });

    await vi.waitFor(() => expect(onFailure).toHaveBeenCalled());
    const message = String(onFailure.mock.calls[0]?.[0]);
    expect(message).toBe(
      formatPlaybackFailure(STREAM, {
        code: 4,
        message: `${safety.message} Fetch: TypeError: Failed to fetch`,
      })
    );
    expect(message).toContain('MediaError 4');
    expect(message).toContain(STREAM);
  });

  it('reloads a stream that is still waiting after two seconds', async () => {
    vi.useFakeTimers();
    try {
      const { audio, video } = mountMedia();
      let calls = 0;
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play() {
        calls += 1;
        if (calls === 1) return new Promise(() => undefined);
        return Promise.resolve();
      });
      const onPlaying = vi.fn();
      startTakePlayback({
        url: STREAM,
        audio,
        video,
        buffered: null,
        fetchImpl: vi.fn(),
        listener: { onPlaying, onFailure: vi.fn(), onNeedsGesture: vi.fn() },
        onBuffer: vi.fn(),
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(onPlaying).toHaveBeenCalled();
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fetch a local file when the element can play it', async () => {
    const { audio, video } = mountMedia();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const fetchImpl = vi.fn();
    const onPlaying = vi.fn();
    startTakePlayback({
      url: '/api/audio/v1/song.mp3',
      audio,
      video,
      buffered: null,
      fetchImpl,
      listener: { onPlaying, onFailure: vi.fn(), onNeedsGesture: vi.fn() },
      onBuffer: vi.fn(),
    });
    await vi.waitFor(() => expect(onPlaying).toHaveBeenCalled());
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(audio.getAttribute('src')).toBe('/api/audio/v1/song.mp3');
  });
});

function mountMedia(): { audio: HTMLAudioElement; video: HTMLVideoElement } {
  const audio = document.createElement('audio');
  const video = document.createElement('video');
  document.body.append(audio, video);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  return { audio, video };
}
