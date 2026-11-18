// @vitest-environment node
import { deflateRawSync } from 'node:zlib';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import {
  ALBUM_LINK_ORIGIN,
  albumListenUrl,
  decodeLinkAlbum,
  decodeLinkFragment,
  encodeLinkAlbum,
  encodeLinkFragment,
  LINK_SCHEMA_VERSION,
  takeFromStreamUrl,
  voteStorageKey,
  type LinkAlbumInput,
} from '@/lib/album/link-fragment';

const require = createRequire(import.meta.url);
const lzString = require('lz-string') as {
  compressToUint8Array: (value: string) => Uint8Array;
};

const albumId = '11111111-2222-4333-8444-555555555555';
const clipA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee01';
const clipB = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee02';

function album(extraTake = false): LinkAlbumInput {
  const takes = [
    { id: clipA, letter: 'A', media: (1 << 2) | 2 },
    ...(extraTake ? [{ id: clipB, letter: 'B', media: (2 << 2) | 1 }] : []),
  ];
  return {
    albumId,
    title: 'Night Bus',
    artist: 'The Night Desk',
    tracks: [
      { number: 1, title: 'Last Platform', takes },
      { number: 2, title: 'Sodium Light', takes: [] },
    ],
  };
}

function mixedUuid(seed: number): string {
  let state = seed >>> 0;
  const bytes: number[] = [];
  for (let index = 0; index < 16; index += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    bytes.push(state & 0xff);
  }
  const version = bytes[6] ?? 0;
  const variant = bytes[8] ?? 0;
  bytes[6] = (version & 0x0f) | 0x40;
  bytes[8] = (variant & 0x3f) | 0x80;
  const hex = bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function representativeAlbum(): LinkAlbumInput {
  const titles = [
    'Last Platform',
    'Sodium Light',
    'Ticket Window',
    'Rain on Steel',
    'Empty Carriage',
    'Third Rail',
    'Overpass',
    'Paper Cup',
    'End of Line',
    'After Hours',
    'Depot Ghost',
    'Home Signal',
  ];
  const tracks = titles.map((title, index) => {
    const number = index + 1;
    return {
      number,
      title,
      takes: [
        { id: mixedUuid(0xa11ce000 + number * 2), letter: 'A', media: (1 << 2) | 1 },
        { id: mixedUuid(0xb0b00000 + number * 2 + 1), letter: 'B', media: (1 << 2) | 2 },
      ],
    };
  });
  return {
    albumId: mixedUuid(0xa1b00a1b),
    title: 'Night Bus',
    artist: 'The Night Desk',
    tracks,
  };
}

describe('album link fragment', () => {
  it('round-trips titles, stable ids, and rebuilt public URLs', () => {
    const decoded = decodeLinkFragment(encodeLinkFragment(album(true)));
    expect(decoded).not.toBeNull();
    if (decoded === null) return;
    expect(decoded.id).toBe('11111111222243338444555555555555');
    expect(decoded.title).toBe('Night Bus');
    expect(decoded.artist).toBe('The Night Desk');
    expect(decoded.coverRef).toBeNull();
    expect(decoded.tracks.map(track => track.number)).toEqual([1, 2]);
    expect(decoded.tracks[1]?.takes).toEqual([]);
    const takes = decoded.tracks[0]?.takes ?? [];
    expect(takes.map(take => take.id)).toEqual([clipA, clipB]);
    expect(takes.map(take => take.letter)).toEqual(['A', 'B']);
    expect(takes[0]?.url).toBe(`https://cdn1.suno.ai/${clipA}.mp4`);
    expect(takes[0]?.fallbackUrl).toBe(`https://cdn1.suno.ai/${clipA}.mp3`);
    expect(takes[1]?.url).toBe(`https://cdn2.suno.ai/${clipB}.mp3`);
    expect(takes[1]?.fallbackUrl).toBe(`https://cdn2.suno.ai/${clipB}.mp4`);
    expect(encodeLinkFragment(album(true))).not.toMatch(/https?:|suno\.ai|\.mp[34]/);
  });

  it('keeps earlier votes addressable when a later snapshot adds a take', () => {
    const first = decodeLinkFragment(encodeLinkFragment(album(false)));
    const second = decodeLinkFragment(encodeLinkFragment(album(true)));
    expect(first?.id).toBe(second?.id);
    expect(first?.tracks[0]?.takes[0]?.id).toBe(second?.tracks[0]?.takes[0]?.id);
    expect(voteStorageKey(first?.id ?? '')).toBe(`album-link:${first?.id}`);
    expect(second?.tracks[0]?.takes).toHaveLength(2);
  });

  it('rejects private URLs, non-UUIDs, and cover URLs', () => {
    expect(takeFromStreamUrl('https://cdn1.suno.ai/clipB.mp4')).toBeNull();
    expect(takeFromStreamUrl('https://example.com/secret.mp3')).toBeNull();
    expect(takeFromStreamUrl(`https://cdn1.suno.ai/${clipA}.mp4?download=1`)).toBeNull();
    expect(takeFromStreamUrl(`https://cdn1.suno.ai/${clipA}.mp3`)?.media).toBe((1 << 2) | 1);
    expect(() =>
      encodeLinkFragment({ ...album(false), coverRef: 'https://cdn1.suno.ai/cover.jpg' })
    ).toThrow(/Cover reference/);
  });

  it('stores a short cover reference and fails closed on old or damaged fragments', () => {
    const withCover = decodeLinkFragment(
      encodeLinkFragment({ ...album(false), coverRef: 'cover-night' })
    );
    expect(withCover?.coverRef).toBe('cover-night');
    expect(decodeLinkFragment('')).toBeNull();
    expect(decodeLinkFragment('%%%')).toBeNull();
    expect(decodeLinkFragment('aaaa')).toBeNull();

    const raw = encodeLinkAlbum(album(false));
    raw[0] = LINK_SCHEMA_VERSION + 1;
    const old = Buffer.from(deflateRawSync(raw)).toString('base64url');
    expect(decodeLinkFragment(old)).toBeNull();
    expect(decodeLinkAlbum(Uint8Array.of(9))).toBeNull();
  });

  it('keeps a 12-track 24-take link under about 1,000 characters', () => {
    const input = representativeAlbum();
    const url = albumListenUrl(input);
    const fragment = url.slice(ALBUM_LINK_ORIGIN.length + 1);
    const raw = encodeLinkAlbum(input);
    let binary = '';
    for (const byte of raw) binary += String.fromCharCode(byte);
    const lzFragment = Buffer.from(lzString.compressToUint8Array(binary)).toString('base64url');
    expect(fragment.length).toBeLessThanOrEqual(lzFragment.length);
    expect(url.startsWith(`${ALBUM_LINK_ORIGIN}#`)).toBe(true);
    expect(url.length).toBeLessThanOrEqual(1000);
    const decoded = decodeLinkFragment(fragment);
    expect(decoded?.tracks).toHaveLength(12);
    let takeCount = 0;
    for (const track of decoded?.tracks ?? []) takeCount += track.takes.length;
    expect(takeCount).toBe(24);
  });

  it('inflates in the browser the same way Node does', async () => {
    const fragment = encodeLinkFragment(album(true));
    const compressed = Buffer.from(fragment, 'base64url');
    const copy = new Uint8Array(compressed);
    const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const inflated = new Uint8Array(await new Response(stream).arrayBuffer());
    expect(decodeLinkAlbum(inflated)?.title).toBe('Night Bus');
  });
});
