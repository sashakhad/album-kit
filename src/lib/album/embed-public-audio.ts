import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { extractAacTrack, mp4DurationSeconds, stripMp4ToM4a } from './mp4-audio.ts';
import { transcodeAacToM4a } from './transcode-aac.ts';
import type { EmbeddedAudio } from './types';

const SUNO_CDN_HOST = /^cdn\d+\.suno\.ai$/;
const SUNO_STREAM_PATH = /^\/([A-Za-z0-9_-]+)\.(mp3|mp4)$/;

const MAX_BYTES = 40 * 1024 * 1024;
/** Open Album.html has to stay under the chat attachment limit, with room to spare. */
export const OPEN_ALBUM_HTML_LIMIT = 22 * 1024 * 1024;
/** The player shell and the album JSON around the audio. */
export const OPEN_ALBUM_SHELL_RESERVE = 900 * 1024;
const BITRATES = [160_000, 128_000, 112_000, 96_000, 80_000, 64_000, 48_000, 32_000];

type StoredAudio = {
  bytes: Buffer;
  mime: string;
  seconds?: number;
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
  /**
   * Largest binary audio object to inline for one take.
   * Omitted sizes every take so four full-length songs still fit in the HTML file.
   */
  maxBytes?: number;
};

/**
 * Bytes of audio that can be inlined for one take and still leave a 4-take page under the limit.
 * Fewer takes on the page use the same per-take cap, so a later take does not force a re-encode.
 */
export function maxEmbeddedAudioBytes(takeCount: number): number {
  const count = takeCount < 4 ? 4 : takeCount;
  const base64Budget = Math.floor((OPEN_ALBUM_HTML_LIMIT - OPEN_ALBUM_SHELL_RESERVE) / count);
  return Math.floor((base64Budget * 3) / 4);
}

/** Highest AAC bitrate whose estimate fits `maxBytes` for this duration. */
export function aacBitrateFor(durationSeconds: number, maxBytes: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 128_000;
  for (const rate of BITRATES) {
    const estimate = Math.ceil((rate / 8) * durationSeconds * 1.12) + 8192;
    if (estimate <= maxBytes) return rate;
  }
  return 32_000;
}

/**
 * Copy one public Suno CDN object into bytes the player can inline.
 * This is an HTTP GET of the public MP4. It does not call Suno's download API
 * and does not spend download credits. A hit under `cacheDir` is not fetched again.
 * Video is dropped. Audio that would blow the HTML attachment limit is re-encoded
 * to a lower AAC bitrate. Returns null when networking is disabled and this url is not cached.
 */
/** A cached shrunk take. Never downloads and never re-encodes. */
export async function cachedPublicAudio(args: {
  url: string;
  cacheDir: string;
  maxBytes?: number;
}): Promise<EmbeddedAudio | null> {
  if (!isPublicSunoStream(args.url)) return null;
  const maxBytes = args.maxBytes ?? maxEmbeddedAudioBytes(4);
  const cached = await readCache(args.cacheDir, args.url);
  if (
    cached !== null &&
    cached.mime.startsWith('audio/') &&
    cached.bytes.length > 0 &&
    cached.bytes.length <= maxBytes
  ) {
    return toEmbedded(cached);
  }
  return null;
}

export async function embedPublicAudio(args: EmbedPublicAudioArgs): Promise<EmbeddedAudio | null> {
  if (!isPublicSunoStream(args.url)) {
    throw new Error('Only a public Suno CDN stream can be embedded.');
  }
  const maxBytes = args.maxBytes ?? maxEmbeddedAudioBytes(4);
  const cached = await readCache(args.cacheDir, args.url);
  if (
    cached !== null &&
    cached.mime.startsWith('audio/') &&
    cached.bytes.length <= maxBytes &&
    cached.bytes.length > 0
  ) {
    return toEmbedded(cached);
  }
  const source =
    cached ??
    (args.allowNetwork === false
      ? null
      : await downloadPublicStream(args.url, args.fetchImpl ?? fetch));
  if (source === null) return null;
  const stored = await shrink(source, maxBytes);
  await writeCache(args.cacheDir, args.url, stored);
  return toEmbedded(stored);
}

async function shrink(stored: StoredAudio, maxBytes: number): Promise<StoredAudio> {
  if (!isIsoBmff(stored.mime)) return stored;
  const bytes = new Uint8Array(
    stored.bytes.buffer,
    stored.bytes.byteOffset,
    stored.bytes.byteLength
  );
  const track = extractAacTrack(bytes);
  if (track === null) {
    const seconds = mp4DurationSeconds(bytes);
    return seconds === null ? stored : { ...stored, seconds };
  }
  const stripped = stripMp4ToM4a(bytes);
  if (stripped === null) return stored;
  if (stripped.bytes.byteLength <= maxBytes) {
    return { bytes: Buffer.from(stripped.bytes), mime: 'audio/mp4', seconds: stripped.seconds };
  }
  try {
    const transcoded = await transcodeAacToM4a(track, aacBitrateFor(track.seconds, maxBytes));
    if (transcoded !== null && transcoded.bytes.byteLength < stripped.bytes.byteLength) {
      return {
        bytes: Buffer.from(transcoded.bytes),
        mime: 'audio/mp4',
        seconds: transcoded.seconds,
      };
    }
  } catch {
    // The audio-only copy still plays offline. A failed re-encode must not block the link.
  }
  return { bytes: Buffer.from(stripped.bytes), mime: 'audio/mp4', seconds: stripped.seconds };
}

function isIsoBmff(mime: string): boolean {
  return mime === 'video/mp4' || mime === 'audio/mp4' || mime === 'audio/m4a';
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
  return { bytes, mime: mediaMime(header, url) };
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

function cachePaths(cacheDir: string, url: string): { meta: string; bin: string } {
  const hash = createHash('sha256').update(`inline-audio-v2\0${url}`).digest('hex');
  return {
    meta: path.join(cacheDir, `${hash}.json`),
    bin: path.join(cacheDir, `${hash}.bin`),
  };
}

async function readCache(cacheDir: string, url: string): Promise<StoredAudio | null> {
  const { meta, bin } = cachePaths(cacheDir, url);
  try {
    const raw: unknown = JSON.parse(await readFile(meta, 'utf8'));
    if (typeof raw !== 'object' || raw === null) return null;
    if (!('url' in raw) || raw.url !== url) return null;
    if (!('mime' in raw) || typeof raw.mime !== 'string') return null;
    if (!raw.mime.startsWith('audio/') && raw.mime !== 'video/mp4') return null;
    if (!('bytes' in raw) || typeof raw.bytes !== 'number') return null;
    const seconds = 'seconds' in raw && typeof raw.seconds === 'number' ? raw.seconds : undefined;
    const bytes = await readFile(bin);
    if (bytes.length !== raw.bytes || bytes.length === 0) return null;
    return seconds === undefined ? { bytes, mime: raw.mime } : { bytes, mime: raw.mime, seconds };
  } catch {
    return null;
  }
}

async function writeCache(cacheDir: string, url: string, stored: StoredAudio): Promise<void> {
  const { meta, bin } = cachePaths(cacheDir, url);
  await mkdir(cacheDir, { recursive: true });
  const binTemp = `${bin}.partial`;
  const metaTemp = `${meta}.partial`;
  await writeFile(binTemp, stored.bytes);
  await writeFile(
    metaTemp,
    JSON.stringify({
      url,
      mime: stored.mime,
      bytes: stored.bytes.length,
      ...(stored.seconds === undefined ? {} : { seconds: stored.seconds }),
    })
  );
  await rename(binTemp, bin);
  await rename(metaTemp, meta);
}

function toEmbedded(stored: StoredAudio): EmbeddedAudio {
  const embedded: EmbeddedAudio = { mime: stored.mime, base64: stored.bytes.toString('base64') };
  if (stored.seconds !== undefined && Number.isFinite(stored.seconds) && stored.seconds > 0) {
    embedded.seconds = Math.round(stored.seconds * 1000) / 1000;
  }
  return embedded;
}
