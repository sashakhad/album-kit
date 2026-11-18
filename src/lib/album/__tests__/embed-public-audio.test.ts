// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  embedPublicAudio,
  isoBmffDurationSeconds,
  type EmbedFetch,
} from '@/lib/album/embed-public-audio';

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

  it('reads the movie duration and ignores a decoy mvhd inside mdat', () => {
    const mvhd = Buffer.alloc(20);
    mvhd.writeUInt32BE(1000, 12);
    mvhd.writeUInt32BE(184405, 16);
    const decoy = Buffer.alloc(32);
    decoy.write('mvhd', 4, 'ascii');
    const file = Buffer.concat([
      box('ftyp', Buffer.from('isom')),
      box('mdat', decoy),
      box('moov', box('mvhd', mvhd)),
    ]);
    expect(isoBmffDurationSeconds(file)).toBeCloseTo(184.405, 3);

    const version1 = Buffer.alloc(32);
    version1.writeUInt8(1, 0);
    version1.writeUInt32BE(1000, 20);
    version1.writeBigUInt64BE(184405n, 24);
    expect(isoBmffDurationSeconds(box('moov', box('mvhd', version1)))).toBeCloseTo(184.405, 3);
    expect(isoBmffDurationSeconds(Buffer.from('not-an-mp4'))).toBeNull();
  });

  it('re-encodes a public MP4 to AAC-LC at the requested review bitrate', async () => {
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
      'sine=frequency=440:duration=3',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=10:duration=3',
      '-shortest',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-b:v',
      '800k',
      '-c:a',
      'aac',
      mp4,
    ]);
    const video = await readFile(mp4);
    let fetches = 0;
    const fetchImpl: EmbedFetch = () => {
      fetches += 1;
      return Promise.resolve(responseFor(video, 'video/mp4'));
    };
    const high = await embedPublicAudio({
      url: clipA,
      cacheDir: dir,
      allowNetwork: true,
      bitrateKbps: 96,
      fetchImpl,
    });
    const low = await embedPublicAudio({
      url: clipA,
      cacheDir: dir,
      allowNetwork: true,
      bitrateKbps: 48,
      fetchImpl,
    });
    const again = await embedPublicAudio({
      url: clipA,
      cacheDir: dir,
      allowNetwork: true,
      bitrateKbps: 48,
      fetchImpl,
    });
    expect(fetches).toBe(1);
    expect(high?.mime).toBe('audio/mp4');
    expect(low?.mime).toBe('audio/mp4');
    expect(again).toEqual(low);
    const highBytes = Buffer.from(high?.base64 ?? '', 'base64');
    const lowBytes = Buffer.from(low?.base64 ?? '', 'base64');
    expect(highBytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
    expect(lowBytes.length).toBeGreaterThan(0);
    expect(lowBytes.length).toBeLessThan(highBytes.length);
    expect(lowBytes.length).toBeLessThan(video.length);
    expect(isoBmffDurationSeconds(video)).toBeCloseTo(3, 0);
    const decoded = path.join(dir, 'decoded.m4a');
    await writeFile(decoded, lowBytes);
    const probed = await run('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=profile,codec_name',
      '-of',
      'csv=p=0',
      decoded,
    ]);
    expect(String(probed.stdout)).toContain('aac');
    expect(String(probed.stdout).toLowerCase()).toContain('lc');
  });
});

function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, payload]);
}
