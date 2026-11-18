// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { embedPublicAudio, type EmbedFetch } from '@/lib/album/embed-public-audio';

const run = promisify(execFile);
const roots: string[] = [];
const clipA = 'https://cdn1.suno.ai/clip-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4';
const clipB = 'https://cdn2.suno.ai/clip-bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee.mp4';

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
  roots.length = 0;
});

async function cacheDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'embed-cache-'));
  roots.push(dir);
  return dir;
}

function responseFor(bytes: Buffer, mime: string, status = 200): Awaited<ReturnType<EmbedFetch>> {
  return {
    status,
    headers: {
      get(name: string) {
        const key = name.toLowerCase();
        if (key === 'content-type') return mime;
        if (key === 'content-length') return String(bytes.length);
        return null;
      },
    },
    arrayBuffer() {
      const copy = Uint8Array.from(bytes);
      return Promise.resolve(copy.buffer);
    },
  };
}

describe('public stream embedding', () => {
  it('fetches a new public stream once and reuses the cache', async () => {
    const dir = await cacheDir();
    const bytes = Buffer.from('audio-bytes');
    let calls = 0;
    const fetchImpl: EmbedFetch = () => {
      calls += 1;
      return Promise.resolve(responseFor(bytes, 'audio/mp4'));
    };
    const first = await embedPublicAudio({
      url: clipA,
      cacheDir: dir,
      allowNetwork: true,
      ffmpegBin: null,
      fetchImpl,
    });
    const second = await embedPublicAudio({
      url: clipA,
      cacheDir: dir,
      allowNetwork: true,
      ffmpegBin: null,
      fetchImpl,
    });
    expect(first).toEqual({ mime: 'audio/mp4', base64: bytes.toString('base64') });
    expect(second).toEqual(first);
    expect(calls).toBe(1);

    await embedPublicAudio({
      url: clipB,
      cacheDir: dir,
      allowNetwork: true,
      ffmpegBin: null,
      fetchImpl,
    });
    expect(calls).toBe(2);
  });

  it('skips the network when embedding is disabled and the cache misses', async () => {
    const dir = await cacheDir();
    const fetchImpl: EmbedFetch = () => {
      throw new Error('fetch should not run');
    };
    await expect(
      embedPublicAudio({
        url: clipA,
        cacheDir: dir,
        allowNetwork: false,
        fetchImpl,
      })
    ).resolves.toBeNull();
  });

  it('refuses a url that is not a public Suno stream', async () => {
    const dir = await cacheDir();
    await expect(
      embedPublicAudio({
        url: 'https://example.com/secret.mp3',
        cacheDir: dir,
        allowNetwork: true,
        fetchImpl: () => Promise.resolve(responseFor(Buffer.from('x'), 'audio/mpeg')),
      })
    ).rejects.toThrow(/public Suno CDN/);
  });

  it('fails the export when the public stream is not media', async () => {
    const dir = await cacheDir();
    await expect(
      embedPublicAudio({
        url: clipA,
        cacheDir: dir,
        allowNetwork: true,
        fetchImpl: () => Promise.resolve(responseFor(Buffer.from('<html>'), 'text/html', 403)),
      })
    ).rejects.toThrow(/403/);
  });

  it('keeps the MP4 when ffmpeg is not available', async () => {
    const dir = await cacheDir();
    const bytes = Buffer.from('full-mp4');
    const embedded = await embedPublicAudio({
      url: clipA,
      cacheDir: dir,
      allowNetwork: true,
      ffmpegBin: null,
      fetchImpl: () => Promise.resolve(responseFor(bytes, 'video/mp4')),
    });
    expect(embedded).toEqual({ mime: 'video/mp4', base64: bytes.toString('base64') });
  });

  it('copies the AAC track out of a public MP4 when ffmpeg is on PATH', async () => {
    try {
      await run('ffmpeg', ['-version']);
    } catch {
      return;
    }
    const dir = await cacheDir();
    const mp4 = path.join(dir, 'source.mp4');
    await run('ffmpeg', [
      '-nostdin',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=16x16:d=1',
      '-shortest',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      mp4,
    ]);
    const video = await readFile(mp4);
    const embedded = await embedPublicAudio({
      url: clipA,
      cacheDir: dir,
      allowNetwork: true,
      fetchImpl: () => Promise.resolve(responseFor(video, 'video/mp4')),
    });
    expect(embedded?.mime).toBe('audio/mp4');
    const audio = Buffer.from(embedded?.base64 ?? '', 'base64');
    expect(audio.subarray(4, 8).toString('ascii')).toBe('ftyp');
    expect(audio.length).toBeGreaterThan(0);
    expect(audio.length).toBeLessThan(video.length);
  });
});
