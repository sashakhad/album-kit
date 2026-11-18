import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { EmbeddedAudio } from './types';

// Same review range as embed-budget.ts. This file stays free of runtime
// imports so `node --experimental-strip-types` can load it on the handoff path.
export const REVIEW_BITRATE_FLOOR_KBPS = 48;
export const REVIEW_BITRATE_CEILING_KBPS = 96;

const SUNO_CDN_HOST = /^cdn\d+\.suno\.ai$/;
const SUNO_STREAM_PATH = /^\/([A-Za-z0-9_-]+)\.(mp3|mp4)$/;

const MAX_BYTES = 40 * 1024 * 1024;
const ENCODE_TIMEOUT_MS = 60_000;

type StoredAudio = {
  bytes: Buffer;
  mime: string;
  durationSeconds: number | null;
};

type MediaResponse = {
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type EmbedFetch = (
  url: string,
  init: {
    redirect: 'follow';
    headers: { Accept: string; 'User-Agent': string };
    signal: AbortSignal;
  }
) => Promise<MediaResponse>;

export type EmbedPublicAudioArgs = {
  url: string;
  cacheDir: string;
  fetchImpl?: EmbedFetch;
  allowNetwork?: boolean;
  /** `null` keeps the downloaded bytes. Omitted uses `ffmpeg` on PATH when it exists. */
  ffmpegBin?: string | null;
  /**
   * AAC-LC review bitrate in kbps. Omitted re-encodes at the ceiling when ffmpeg
   * is available. `ffmpegBin: null` ignores this and returns the source bytes.
   */
  bitrateKbps?: number;
};

/**
 * Copy one public Suno CDN object into bytes the player can inline.
 * This is an HTTP GET of the public MP4. It does not call Suno's download API
 * and does not spend download credits. A hit under `cacheDir` is not fetched again.
 * Returns null when networking is disabled and this url is not cached.
 * With ffmpeg, the audio is re-encoded to AAC-LC at `bitrateKbps` instead of
 * keeping Suno's original bitrate.
 */
export async function embedPublicAudio(args: EmbedPublicAudioArgs): Promise<EmbeddedAudio | null> {
  if (!isPublicSunoStream(args.url)) {
    throw new Error('Only a public Suno CDN stream can be embedded.');
  }
  const bitrate = encodeBitrate(args);
  if (bitrate !== null) {
    const cached = await readEncoded(args.cacheDir, args.url, bitrate);
    if (cached !== null) return toEmbedded(cached);
  }
  const loaded = await loadPublicSource(args);
  if (loaded === null) return null;
  const source = await readSource(args.cacheDir, args.url);
  if (source === null) return null;
  if (bitrate === null) return toEmbedded(source);
  const encoded = await encodeAac(source, bitrate, args.ffmpegBin ?? 'ffmpeg');
  if (encoded === null) return toEmbedded(source);
  await writeEncoded(args.cacheDir, args.url, bitrate, encoded);
  return toEmbedded(encoded);
}

/**
 * Download a public stream into the source cache and report its duration.
 * Does not re-encode. Returns null when networking is disabled and the url is not cached.
 */
export async function loadPublicSource(
  args: EmbedPublicAudioArgs
): Promise<{ mime: string; byteLength: number; durationSeconds: number | null } | null> {
  if (!isPublicSunoStream(args.url)) {
    throw new Error('Only a public Suno CDN stream can be embedded.');
  }
  const cached = await readSource(args.cacheDir, args.url);
  if (cached !== null) {
    return {
      mime: cached.mime,
      byteLength: cached.bytes.length,
      durationSeconds: cached.durationSeconds,
    };
  }
  if (args.allowNetwork === false) return null;
  const downloaded = await downloadPublicStream(args.url, args.fetchImpl ?? fetch);
  const stored: StoredAudio = {
    ...downloaded,
    durationSeconds: isoBmffDurationSeconds(downloaded.bytes),
  };
  await writeSource(args.cacheDir, args.url, stored);
  return {
    mime: stored.mime,
    byteLength: stored.bytes.length,
    durationSeconds: stored.durationSeconds,
  };
}

/** Movie duration from an ISO BMFF file (MP4 or M4A). Null when the header is unreadable. */
export function isoBmffDurationSeconds(bytes: Buffer): number | null {
  return moovDuration(bytes, 0, bytes.length);
}

function encodeBitrate(args: EmbedPublicAudioArgs): number | null {
  if (args.ffmpegBin === null) return null;
  const requested = args.bitrateKbps ?? REVIEW_BITRATE_CEILING_KBPS;
  if (!Number.isFinite(requested)) return REVIEW_BITRATE_CEILING_KBPS;
  const snapped = Math.floor(requested / 8) * 8;
  if (snapped < REVIEW_BITRATE_FLOOR_KBPS) return REVIEW_BITRATE_FLOOR_KBPS;
  if (snapped > REVIEW_BITRATE_CEILING_KBPS) return REVIEW_BITRATE_CEILING_KBPS;
  return snapped;
}

async function downloadPublicStream(url: string, fetchImpl: EmbedFetch): Promise<StoredAudio> {
  let response: MediaResponse;
  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      headers: { Accept: 'audio/*, video/mp4', 'User-Agent': 'album-kit' },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The public stream could not be read.';
    throw new Error(`Could not embed ${url}: ${message}`);
  }
  const header = response.headers.get('content-type');
  if (!isPublicMedia(response.status, header)) {
    throw new Error(
      `Could not embed ${url}: the public stream returned ${String(response.status)} ${header ?? 'without a media type'}.`
    );
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new Error(`Could not embed ${url}: the public stream is too large.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error(`Could not embed ${url}: the public stream was empty.`);
  if (bytes.length > MAX_BYTES) {
    throw new Error(`Could not embed ${url}: the public stream is too large.`);
  }
  return { bytes, mime: mediaMime(header, url), durationSeconds: null };
}

function isPublicSunoStream(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    !SUNO_CDN_HOST.test(parsed.hostname)
  ) {
    return false;
  }
  return SUNO_STREAM_PATH.test(parsed.pathname);
}

function isPublicMedia(status: number, contentType: string | null): boolean {
  if (status !== 200 && status !== 206) return false;
  if (contentType === null) return false;
  const type = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return type === 'video/mp4' || type.startsWith('audio/');
}

function mediaMime(header: string | null, url: string): string {
  const type = header?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (type.startsWith('audio/') || type === 'video/mp4') return type;
  return url.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4';
}

/**
 * Re-encode to AAC-LC. The built-in ffmpeg encoder has no reliable HE-AAC mode,
 * so review copies stay on LC between 48 and 96 kbps.
 * Returns null when ffmpeg is missing or the output is not a smaller M4A.
 */
async function encodeAac(
  source: StoredAudio,
  bitrateKbps: number,
  ffmpegBin: string
): Promise<StoredAudio | null> {
  let dir: string;
  try {
    dir = await mkdtemp(path.join(tmpdir(), 'album-audio-'));
  } catch {
    return null;
  }
  try {
    const input = path.join(dir, source.mime === 'audio/mpeg' ? 'in.mp3' : 'in.mp4');
    const output = path.join(dir, 'out.m4a');
    await writeFile(input, source.bytes);
    const code = await runCommand(ffmpegBin, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      input,
      '-vn',
      '-map',
      '0:a:0',
      '-c:a',
      'aac',
      '-profile:a',
      'aac_low',
      '-b:a',
      `${String(bitrateKbps)}k`,
      output,
    ]);
    if (code !== 0) return null;
    const audio = await readFile(output);
    if (audio.length === 0 || audio.length >= source.bytes.length) return null;
    if (!looksLikeIsoBmff(audio)) return null;
    return {
      bytes: audio,
      mime: 'audio/mp4',
      durationSeconds: isoBmffDurationSeconds(audio) ?? source.durationSeconds,
    };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function looksLikeIsoBmff(bytes: Buffer): boolean {
  return bytes.length > 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
}

function moovDuration(bytes: Buffer, start: number, end: number): number | null {
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    let header = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > end) return null;
      const large = bytes.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(large);
      header = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (!Number.isFinite(size) || size < header || offset + size > end) return null;
    const bodyStart = offset + header;
    const bodyEnd = offset + size;
    if (type === 'moov') {
      const duration = mvhdDuration(bytes, bodyStart, bodyEnd);
      if (duration !== null) return duration;
    }
    offset += size;
  }
  return null;
}

function mvhdDuration(bytes: Buffer, start: number, end: number): number | null {
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    let header = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > end) return null;
      const large = bytes.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(large);
      header = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (!Number.isFinite(size) || size < header || offset + size > end) return null;
    if (type === 'mvhd') return mvhdSeconds(bytes, offset + header, offset + size);
    offset += size;
  }
  return null;
}

function mvhdSeconds(bytes: Buffer, start: number, end: number): number | null {
  if (start >= end) return null;
  const version = bytes.readUInt8(start);
  if (version === 0) {
    if (start + 20 > end) return null;
    return secondsFromScale(bytes.readUInt32BE(start + 16), bytes.readUInt32BE(start + 12));
  }
  if (version === 1) {
    if (start + 32 > end) return null;
    const duration = bytes.readBigUInt64BE(start + 24);
    if (duration > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return secondsFromScale(Number(duration), bytes.readUInt32BE(start + 20));
  }
  return null;
}

function secondsFromScale(duration: number, timescale: number): number | null {
  if (timescale <= 0 || !Number.isFinite(duration) || duration <= 0) return null;
  const seconds = duration / timescale;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 2 * 60 * 60) return null;
  return seconds;
}

function runCommand(bin: string, args: string[]): Promise<number> {
  return new Promise(resolve => {
    const child = spawn(bin, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, ENCODE_TIMEOUT_MS);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(1);
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

function sourcePaths(cacheDir: string, url: string): { meta: string; bin: string } {
  const hash = createHash('sha256').update(url).digest('hex');
  return pair(path.join(cacheDir, 'source'), hash);
}

function encodedPaths(
  cacheDir: string,
  url: string,
  bitrateKbps: number
): { meta: string; bin: string } {
  const hash = createHash('sha256')
    .update(`${url}\0aac-lc\0${String(bitrateKbps)}`)
    .digest('hex');
  return pair(path.join(cacheDir, 'aac'), hash);
}

function pair(directory: string, hash: string): { meta: string; bin: string } {
  return {
    meta: path.join(directory, `${hash}.json`),
    bin: path.join(directory, `${hash}.bin`),
  };
}

async function readSource(cacheDir: string, url: string): Promise<StoredAudio | null> {
  return readStored(sourcePaths(cacheDir, url), url, null);
}

async function readEncoded(
  cacheDir: string,
  url: string,
  bitrateKbps: number
): Promise<StoredAudio | null> {
  return readStored(encodedPaths(cacheDir, url, bitrateKbps), url, bitrateKbps);
}

async function readStored(
  files: { meta: string; bin: string },
  url: string,
  bitrateKbps: number | null
): Promise<StoredAudio | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(files.meta, 'utf8'));
    if (typeof raw !== 'object' || raw === null) return null;
    if (!('url' in raw) || raw.url !== url) return null;
    if (!('mime' in raw) || typeof raw.mime !== 'string') return null;
    if (!raw.mime.startsWith('audio/') && raw.mime !== 'video/mp4') return null;
    if (!('bytes' in raw) || typeof raw.bytes !== 'number') return null;
    const tagged = 'bitrateKbps' in raw ? raw.bitrateKbps : null;
    if (bitrateKbps === null) {
      if (tagged !== null && tagged !== undefined) return null;
    } else if (tagged !== bitrateKbps) {
      return null;
    }
    const bytes = await readFile(files.bin);
    if (bytes.length !== raw.bytes || bytes.length === 0) return null;
    let durationSeconds: number | null = null;
    if (
      'durationSeconds' in raw &&
      typeof raw.durationSeconds === 'number' &&
      raw.durationSeconds > 0
    ) {
      durationSeconds = raw.durationSeconds;
    }
    return { bytes, mime: raw.mime, durationSeconds };
  } catch {
    return null;
  }
}

async function writeSource(cacheDir: string, url: string, stored: StoredAudio): Promise<void> {
  await writeStored(sourcePaths(cacheDir, url), url, stored, null);
}

async function writeEncoded(
  cacheDir: string,
  url: string,
  bitrateKbps: number,
  stored: StoredAudio
): Promise<void> {
  await writeStored(encodedPaths(cacheDir, url, bitrateKbps), url, stored, bitrateKbps);
}

async function writeStored(
  files: { meta: string; bin: string },
  url: string,
  stored: StoredAudio,
  bitrateKbps: number | null
): Promise<void> {
  await mkdir(path.dirname(files.bin), { recursive: true });
  const binTemp = `${files.bin}.partial`;
  const metaTemp = `${files.meta}.partial`;
  const meta = {
    url,
    mime: stored.mime,
    bytes: stored.bytes.length,
    durationSeconds: stored.durationSeconds,
    ...(bitrateKbps === null ? {} : { bitrateKbps }),
  };
  await writeFile(binTemp, stored.bytes);
  await writeFile(metaTemp, JSON.stringify(meta));
  await rename(binTemp, files.bin);
  await rename(metaTemp, files.meta);
}

function toEmbedded(stored: StoredAudio): EmbeddedAudio {
  return { mime: stored.mime, base64: stored.bytes.toString('base64') };
}
