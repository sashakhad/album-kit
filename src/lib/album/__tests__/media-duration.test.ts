import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { knownMediaDuration, remoteMp4Duration } from '@/lib/album/media-duration';
import { mp4DurationSeconds } from '@/lib/album/mp4-audio';

describe('media duration', () => {
  it('reads a finite duration and ignores a missing one', () => {
    expect(knownMediaDuration({ duration: 80, seekable: { length: 0, end: () => 0 } })).toBe(80);
    expect(
      knownMediaDuration({ duration: Number.NaN, seekable: { length: 1, end: () => 125 } })
    ).toBe(125);
    expect(
      knownMediaDuration({
        duration: Number.POSITIVE_INFINITY,
        seekable: { length: 0, end: () => 0 },
      })
    ).toBeNull();
  });

  it('reads the movie header from the end of a Suno-style MP4', async () => {
    const bytes = new Uint8Array(
      await readFile(path.join(import.meta.dirname, 'fixtures/tone-with-picture.mp4'))
    );
    const whole = mp4DurationSeconds(bytes);
    expect(whole).toBeGreaterThan(0.5);
    expect(whole).toBeLessThan(2);
    const tail = bytes.subarray(Math.max(0, bytes.length - 8192));
    expect(mp4DurationSeconds(tail)).toBeCloseTo(whole ?? 0, 2);
  });

  it('uses a suffix range and ignores a full-body response', async () => {
    const calls: string[] = [];
    const found = await remoteMp4Duration('https://cdn1.suno.ai/clip.mp4', async (url, init) => {
      calls.push(url);
      const headers = new Headers(init?.headers);
      expect(headers.get('Range')).toBe('bytes=-131072');
      const body = new Uint8Array(
        await readFile(path.join(import.meta.dirname, 'fixtures/tone-with-picture.mp4'))
      );
      return new Response(body.subarray(body.length - 8192), {
        status: 206,
        headers: { 'content-type': 'video/mp4' },
      });
    });
    expect(calls).toEqual(['https://cdn1.suno.ai/clip.mp4']);
    expect(found).toBeGreaterThan(0.5);

    const ignored = await remoteMp4Duration('https://cdn1.suno.ai/clip.mp4', async () => {
      return new Response(new Uint8Array(8), { status: 200 });
    });
    expect(ignored).toBeNull();
  });
});
