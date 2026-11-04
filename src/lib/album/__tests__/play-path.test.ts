import { describe, expect, it } from 'vitest';

import {
  indexForTrackNumber,
  listenHref,
  parseTakeSegment,
  resolveTrack,
  resolveTrackNumber,
  voteHref,
} from '../play-path';
import type { AlbumTrack } from '../types';

function track(number: number, title: string, audioUrl: string | null): AlbumTrack {
  return {
    number,
    title,
    kind: 'album',
    filename: audioUrl === null ? null : `${number}.mp3`,
    audioUrl,
    takes: [],
    prompt: null,
  };
}

const tracks: AlbumTrack[] = [
  track(1, "D0n't St0p", '/a.mp3'),
  track(11, 'BΛD_IDEA', '/b.mp3'),
  track(2, 'Track Two', null),
  track(6, 'B1g R00m', '/c.mp3'),
  track(13, 'LOUD//BUT//KIND', '/d.mp3'),
  track(4, 'wh!stle 1t', '/e.mp3'),
  track(12, 'BΛD_IDEA (VIP)', '/f.mp3'),
];

describe('voteHref', () => {
  it('names the song, set and take', () => {
    expect(voteHref({ title: 'BΛD_IDEA', versionSlug: 'v1', takeLabel: 'F' })).toBe(
      '/vote/b-d-idea/v1/f'
    );
    expect(voteHref({ title: "D0n't St0p", versionSlug: 'v2', takeLabel: 'AA' })).toBe(
      '/vote/d0nt-st0p/v2/aa'
    );
  });

  it('links to the track or to the round without a take', () => {
    expect(voteHref({ title: 'Track Two' })).toBe('/vote/track-two');
    expect(voteHref()).toBe('/vote');
  });
});

describe('listenHref', () => {
  it('links a listen row by its title', () => {
    expect(listenHref({ title: 'B1g R00m' })).toBe('/listen/b1g-r00m');
    expect(listenHref({ title: 'BΛD_IDEA (VIP)' })).toBe('/listen/b-d-idea-vip');
    expect(listenHref()).toBe('/listen');
  });
});

describe('resolveTrackNumber', () => {
  it('accepts a title slug or a track number', () => {
    expect(resolveTrackNumber('b-d-idea', tracks)).toBe(11);
    expect(resolveTrackNumber('b-d-idea-vip', tracks)).toBe(12);
    expect(resolveTrackNumber('11', tracks)).toBe(11);
    expect(resolveTrackNumber('d0nt-st0p', tracks)).toBe(1);
    expect(resolveTrackNumber('b1g-r00m', tracks)).toBe(6);
    expect(resolveTrackNumber('loud-but-kind', tracks)).toBe(13);
    expect(resolveTrackNumber('wh-stle-1t', tracks)).toBe(4);
    expect(resolveTrackNumber('missing', tracks)).toBeNull();
    expect(resolveTrack('track-two', tracks)?.title).toBe('Track Two');
  });
});

describe('parseTakeSegment', () => {
  it('reads a single take letter', () => {
    expect(parseTakeSegment('f')).toBe('F');
    expect(parseTakeSegment('A')).toBe('A');
    expect(parseTakeSegment('aa')).toBe('AA');
    expect(parseTakeSegment('nope')).toBeNull();
    expect(parseTakeSegment(undefined)).toBeNull();
  });
});

describe('indexForTrackNumber', () => {
  it('skips tracks with no audio', () => {
    expect(indexForTrackNumber(tracks, 11)).toBe(1);
    expect(indexForTrackNumber(tracks, 2)).toBeNull();
    expect(indexForTrackNumber(tracks, 28)).toBeNull();
  });
});
