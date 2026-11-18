import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * Album-in-the-link snapshot, schema version 1.
 *
 * Uncompressed bytes, then raw deflate, then base64url in the URL fragment.
 * The fragment is not a request. The page stores nothing.
 *
 *   u8  version = 1
 *   u8  flags (bit 0 artist, bit 1 cover reference)
 *   u8  album id length (8 or 16) + raw id bytes
 *   u8  title length + utf8 title
 *   [artist] u8 length + utf8
 *   [cover]  u8 length + utf8 short reference, never a URL or image
 *   u8  track count
 *   track:
 *     u8 track number
 *     u8 title length + utf8 title
 *     u8 take count
 *     take:
 *       16 byte clip UUID
 *       u8 letter index (1 = A)
 *       u8 media (low 2 bits: 1 mp3, 2 mp4, 0 unknown; high 6 bits: cdn host)
 */

export const ALBUM_LINK_ORIGIN = 'https://album-bot-site.vercel.app/a';
export const LINK_SCHEMA_VERSION = 1;
export const LINK_COMPRESSION = 'deflate-raw';

const FLAG_ARTIST = 1;
const FLAG_COVER = 2;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_ID_PATTERN = /^[0-9a-f]{16}$/i;
const LETTER_PATTERN = /^[A-Z]+$/;
const COVER_PATTERN = /^[A-Za-z0-9_-]{1,48}$/;
const STREAM_HOST = /^cdn(\d+)\.suno\.ai$/;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export type LinkTakeInput = {
  id: string;
  letter: string;
  media: number;
};

export type LinkTrackInput = {
  number: number;
  title: string;
  takes: readonly LinkTakeInput[];
};

export type LinkAlbumInput = {
  albumId: string;
  title: string;
  artist?: string;
  coverRef?: string;
  tracks: readonly LinkTrackInput[];
};

export type DecodedTake = {
  id: string;
  letter: string;
  url: string;
  fallbackUrl: string;
};

export type DecodedTrack = {
  number: number;
  title: string;
  takes: DecodedTake[];
};

export type DecodedLinkAlbum = {
  id: string;
  title: string;
  artist: string;
  coverRef: string | null;
  tracks: DecodedTrack[];
};

export function voteStorageKey(albumId: string): string {
  return `album-link:${albumId}`;
}

export function takeLetter(index: number): string {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error('Take letter is out of range.');
  }
  let rest = index;
  let label = '';
  while (rest > 0) {
    rest -= 1;
    label = String.fromCharCode(65 + (rest % 26)) + label;
    rest = Math.floor(rest / 26);
  }
  return label;
}

export function letterIndex(letter: string): number {
  if (!LETTER_PATTERN.test(letter)) {
    throw new Error('Take letter is invalid.');
  }
  let index = 0;
  for (const character of letter) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  if (index < 1 || index > 255) {
    throw new Error('Take letter is out of range.');
  }
  return index;
}

/** Public Suno clip only. Full CDN URLs are not stored. */
export function takeFromStreamUrl(url: string): { id: string; media: number } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    return null;
  }
  const host = STREAM_HOST.exec(parsed.hostname);
  if (host === null) return null;
  const cdn = Number(host[1]);
  if (!Number.isInteger(cdn) || cdn < 1 || cdn > 63) return null;
  const match =
    /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(mp3|mp4)$/i.exec(
      parsed.pathname
    );
  if (match === null) return null;
  const id = match[1];
  const extension = match[2];
  if (id === undefined || extension === undefined) return null;
  const kind = extension.toLowerCase() === 'mp3' ? 1 : 2;
  return { id: id.toLowerCase(), media: (cdn << 2) | kind };
}

export function albumListenUrl(input: LinkAlbumInput): string {
  return `${ALBUM_LINK_ORIGIN}#${encodeLinkFragment(input)}`;
}

export function encodeLinkFragment(input: LinkAlbumInput): string {
  return encodeBase64Url(deflateRawSync(encodeLinkAlbum(input), { level: 9 }));
}

export function encodeLinkAlbum(input: LinkAlbumInput): Uint8Array {
  const albumId = albumIdBytes(input.albumId);
  const title = utf8(input.title);
  const artist =
    input.artist === undefined || input.artist.length === 0 ? null : utf8(input.artist);
  const cover = normalizeCover(input.coverRef);
  let flags = 0;
  if (artist !== null) flags |= FLAG_ARTIST;
  if (cover !== null) flags |= FLAG_COVER;

  const parts: Uint8Array[] = [
    u8(LINK_SCHEMA_VERSION),
    u8(flags),
    u8(albumId.length),
    albumId,
    u8(title.length),
    title,
  ];
  if (artist !== null) parts.push(u8(artist.length), artist);
  if (cover !== null) {
    const coverBytes = utf8(cover);
    parts.push(u8(coverBytes.length), coverBytes);
  }
  if (input.tracks.length > 255) throw new Error('An album link can hold 255 tracks.');
  parts.push(u8(input.tracks.length));

  const seenTakes = new Set<string>();
  const seenTracks = new Set<number>();
  for (const track of input.tracks) {
    if (!Number.isInteger(track.number) || track.number < 1 || track.number > 255) {
      throw new Error('Track number is out of range.');
    }
    if (seenTracks.has(track.number)) throw new Error('Two tracks share a number.');
    seenTracks.add(track.number);
    const trackTitle = utf8(track.title);
    if (track.takes.length > 255) throw new Error('A track link can hold 255 takes.');
    parts.push(u8(track.number), u8(trackTitle.length), trackTitle, u8(track.takes.length));
    const seenLetters = new Set<number>();
    for (const take of track.takes) {
      const id = normalizeUuid(take.id);
      if (seenTakes.has(id)) throw new Error('Two takes share a clip id.');
      seenTakes.add(id);
      const letter = letterIndex(take.letter);
      if (seenLetters.has(letter)) throw new Error('Two takes share a letter.');
      seenLetters.add(letter);
      assertMedia(take.media);
      parts.push(hexToBytes(id.replaceAll('-', '')), u8(letter), u8(take.media));
    }
  }
  return concat(parts);
}

export function decodeLinkFragment(fragment: string): DecodedLinkAlbum | null {
  const compressed = decodeBase64Url(fragment.startsWith('#') ? fragment.slice(1) : fragment);
  if (compressed === null || compressed.length === 0) return null;
  let inflated: Buffer;
  try {
    inflated = inflateRawSync(compressed);
  } catch {
    return null;
  }
  return decodeLinkAlbum(inflated);
}

export function decodeLinkAlbum(bytes: Uint8Array): DecodedLinkAlbum | null {
  try {
    return readAlbum(bytes);
  } catch {
    return null;
  }
}

export function mediaUrls(id: string, media: number): { url: string; fallbackUrl: string } {
  const kind = media & 3;
  const host = media >> 2;
  const cdn = host === 0 ? 1 : host;
  const mp3 = `https://cdn${cdn}.suno.ai/${id}.mp3`;
  const mp4 = `https://cdn${cdn}.suno.ai/${id}.mp4`;
  if (kind === 2) return { url: mp4, fallbackUrl: mp3 };
  return { url: mp3, fallbackUrl: mp4 };
}

function readAlbum(bytes: Uint8Array): DecodedLinkAlbum {
  const reader = new Reader(bytes);
  const version = reader.u8();
  if (version !== LINK_SCHEMA_VERSION) {
    throw new Error('Unsupported album link.');
  }
  const flags = reader.u8();
  if ((flags & ~(FLAG_ARTIST | FLAG_COVER)) !== 0) throw new Error('Unknown album link flag.');
  const albumLength = reader.u8();
  if (albumLength !== 8 && albumLength !== 16) throw new Error('Album id length is invalid.');
  const id = hex(reader.raw(albumLength));
  const title = reader.text();
  const artist = (flags & FLAG_ARTIST) === 0 ? '' : reader.text();
  const coverRef = (flags & FLAG_COVER) === 0 ? null : reader.text();
  if (coverRef !== null && !COVER_PATTERN.test(coverRef))
    throw new Error('Cover reference is invalid.');
  const trackCount = reader.u8();
  const tracks: DecodedTrack[] = [];
  const seenTakes = new Set<string>();
  const seenTracks = new Set<number>();
  for (let index = 0; index < trackCount; index += 1) {
    const number = reader.u8();
    if (number < 1 || seenTracks.has(number)) throw new Error('Track id is invalid.');
    seenTracks.add(number);
    const trackTitle = reader.text();
    const takeCount = reader.u8();
    const takes: DecodedTake[] = [];
    const seenLetters = new Set<string>();
    for (let takeIndex = 0; takeIndex < takeCount; takeIndex += 1) {
      const rawId = reader.raw(16);
      const takeId = formatUuid(rawId);
      if (seenTakes.has(takeId)) throw new Error('Duplicate take id.');
      seenTakes.add(takeId);
      const letter = takeLetter(reader.u8());
      if (seenLetters.has(letter)) throw new Error('Duplicate take letter.');
      seenLetters.add(letter);
      const media = reader.u8();
      assertMedia(media);
      const urls = mediaUrls(takeId, media);
      takes.push({ id: takeId, letter, url: urls.url, fallbackUrl: urls.fallbackUrl });
    }
    tracks.push({ number, title: trackTitle, takes });
  }
  if (!reader.finished()) throw new Error('Album link has trailing bytes.');
  return { id, title, artist, coverRef, tracks };
}

class Reader {
  private offset = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  u8(): number {
    const value = this.bytes[this.offset];
    if (value === undefined) throw new Error('Album link is truncated.');
    this.offset += 1;
    return value;
  }

  raw(length: number): Uint8Array {
    const end = this.offset + length;
    if (end > this.bytes.length) throw new Error('Album link is truncated.');
    const slice = this.bytes.slice(this.offset, end);
    this.offset = end;
    return slice;
  }

  text(): string {
    const length = this.u8();
    return textDecoder.decode(this.raw(length));
  }

  finished(): boolean {
    return this.offset === this.bytes.length;
  }
}

function normalizeCover(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!COVER_PATTERN.test(value) || value.includes('suno')) {
    throw new Error('Cover reference must be a short id, not a URL or an image.');
  }
  return value;
}

function normalizeUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error('Take id must be a Suno clip UUID.');
  return value.toLowerCase();
}

function assertMedia(media: number): void {
  if (!Number.isInteger(media) || media < 0 || media > 255 || (media & 3) === 3) {
    throw new Error('Take media is invalid.');
  }
  const host = media >> 2;
  if (host > 63) throw new Error('Take media is invalid.');
}

function albumIdBytes(albumId: string): Uint8Array {
  if (UUID_PATTERN.test(albumId)) return hexToBytes(albumId.replaceAll('-', '').toLowerCase());
  if (SHORT_ID_PATTERN.test(albumId)) return hexToBytes(albumId.toLowerCase());
  throw new Error('Album id must be the saved preview identifier.');
}

function utf8(value: string): Uint8Array {
  const bytes = textEncoder.encode(value);
  if (bytes.length > 255) throw new Error('Album link text is too long.');
  return bytes;
}

function u8(value: number): Uint8Array {
  return Uint8Array.of(value);
}

function concat(parts: Uint8Array[]): Uint8Array {
  let size = 0;
  for (const part of parts) size += part.length;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function hexToBytes(hexId: string): Uint8Array {
  const out = new Uint8Array(hexId.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    const byte = Number.parseInt(hexId.slice(index * 2, index * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error('Album id is invalid.');
    out[index] = byte;
  }
  return out;
}

function hex(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += byte.toString(16).padStart(2, '0');
  return text;
}

function formatUuid(bytes: Uint8Array): string {
  const hexId = hex(bytes);
  return `${hexId.slice(0, 8)}-${hexId.slice(8, 12)}-${hexId.slice(12, 16)}-${hexId.slice(16, 20)}-${hexId.slice(20)}`;
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length === 0) return null;
  return decoded;
}
