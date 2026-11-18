import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { EmbeddedAudio } from './types';

const SUNO_CDN_HOST = /^cdn\d+\.suno\.ai$/;
const SUNO_STREAM_PATH = /^\/([A-Za-z0-9_-]+)\.(mp3|mp4)$/;

const MAX_BYTES = 40 * 1024 * 1024;

type StoredAudio = {
  bytes: Buffer;
  mime: string;
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
};

/**
 * Copy one public Suno CDN object into bytes the player can inline.
 * This is an HTTP GET of the public MP4. It does not call Suno's download API
 * and does not spend download credits. A hit under `cacheDir` is not fetched again.
 * Returns null when networking is disabled and this url is not cached.
 */
export async function embedPublicAudio(args: EmbedPublicAudioArgs): Promise<EmbeddedAudio | null> {
  if (!isPublicSunoStream(args.url)) {
    throw new Error('Only a public Suno CDN stream can be embedded.');
  }
  const cached = await readCache(args.cacheDir, args.url);
  if (cached !== null) return toEmbedded(cached);
  if (args.allowNetwork === false) return null;
  const downloaded = await downloadPublicStream(args.url, args.fetchImpl ?? fetch);
  const extracted = await extractAudio(downloaded, args.ffmpegBin);
  const stored = extracted ?? downloaded;
  await writeCache(args.cacheDir, args.url, stored);
  return toEmbedded(stored);
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

async function extractAudio(
  downloaded: StoredAudio,
  ffmpegBin: string | null | undefined
): Promise<StoredAudio | null> {
  if (!downloaded.mime.startsWith('video/')) return null;
  if (ffmpegBin === null) return null;
  const bin = ffmpegBin ?? 'ffmpeg';
  let dir: string;
  try {
    dir = await mkdtemp(path.join(tmpdir(), 'album-audio-'));
  } catch {
    return null;
  }
  try {
    const input = path.join(dir, 'in.mp4');
    const output = path.join(dir, 'out.m4a');
    await writeFile(input, downloaded.bytes);
    const code = await runCommand(bin, [
      '-nostdin',
      '-y',
      '-i',
      input,
      '-vn',
      '-map',
      '0:a:0',
      '-c:a',
      'copy',
      output,
    ]);
    if (code !== 0) return null;
    const audio = await readFile(output);
    if (audio.length === 0 || audio.length >= downloaded.bytes.length) return null;
    if (!looksLikeIsoBmff(audio)) return null;
    return { bytes: audio, mime: 'audio/mp4' };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function looksLikeIsoBmff(bytes: Buffer): boolean {
  return bytes.length > 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
}

function runCommand(bin: string, args: string[]): Promise<number> {
  return new Promise(resolve => {
    const child = spawn(bin, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 30_000);
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

function cachePaths(cacheDir: string, url: string): { meta: string; bin: string } {
  const hash = createHash('sha256').update(url).digest('hex');
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
    const bytes = await readFile(bin);
    if (bytes.length !== raw.bytes || bytes.length === 0) return null;
    return { bytes, mime: raw.mime };
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
  await writeFile(metaTemp, JSON.stringify({ url, mime: stored.mime, bytes: stored.bytes.length }));
  await rename(binTemp, bin);
  await rename(metaTemp, meta);
}

function toEmbedded(stored: StoredAudio): EmbeddedAudio {
  return { mime: stored.mime, base64: stored.bytes.toString('base64') };
}
