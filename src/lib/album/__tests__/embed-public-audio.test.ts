// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { embedPublicAudio, type EmbedFetch } from '@/lib/album/embed-public-audio';
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
      fetchImpl,
    });
    const second = await embedPublicAudio({
      url: clipA,
      cacheDir: dir,
      allowNetwork: true,
      fetchImpl,
    });
    expect(first).toEqual({ mime: 'audio/mp4', base64: bytes.toString('base64') });
    expect(second).toEqual(first);
    expect(calls).toBe(1);

    await embedPublicAudio({
      url: clipB,
      cacheDir: dir,
      allowNetwork: true,
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

  it('keeps bytes that are not an MP4', async () => {
    const dir = await cacheDir();
    const bytes = Buffer.from('full-mp4');
    const embedded = await embedPublicAudio({
      url: clipA,
      cacheDir: dir,
      allowNetwork: true,
      fetchImpl: () => Promise.resolve(responseFor(bytes, 'video/mp4')),
    });
    expect(embedded).toEqual({ mime: 'video/mp4', base64: bytes.toString('base64') });
  });

  it('drops the picture and re-encodes when four takes would not fit', async () => {
    const dir = await cacheDir();
    const video = await readFile(path.join(import.meta.dirname, 'fixtures/tone-with-picture.mp4'));
    const embedded = await embedPublicAudio({
      url: clipA,
      cacheDir: dir,
      allowNetwork: true,
      maxBytes: 8_000,
      fetchImpl: () => Promise.resolve(responseFor(video, 'video/mp4')),
    });
    expect(embedded?.mime).toBe('audio/mp4');
    expect(embedded?.seconds).toBeGreaterThan(0.5);
    const audio = Buffer.from(embedded?.base64 ?? '', 'base64');
    expect(audio.subarray(4, 8).toString('ascii')).toBe('ftyp');
    expect(audio.length).toBeGreaterThan(0);
    expect(audio.length).toBeLessThan(video.length);
    expect(audio.length).toBeLessThanOrEqual(8_000);
  });
});
