import { describe, expect, it } from 'vitest';

import { parseAlbumConfig, type AlbumConfig } from '../album-config';
import {
  applyListenSelections,
  buildListenVersion,
  findListenTrack,
  isListenFile,
} from '../listen';
import type { AlbumTake, AlbumTrack, AlbumVersion } from '../types';

function take(versionSlug: string, filename: string, letter: string): AlbumTake {
  return {
    label: letter,
    filename,
    audioUrl: `/api/audio/${versionSlug}/${filename}`,
    versionSlug,
    voteLabel: letter,
  };
}

function track(number: number, title: string, takes: AlbumTake[]): AlbumTrack {
  return {
    number,
    title,
    kind: 'album',
    filename: takes[0]?.filename ?? null,
    audioUrl: takes[0]?.audioUrl ?? null,
    takes,
    prompt: null,
  };
}

const bubu: AlbumVersion = {
  slug: 'v1',
  folder: 'v1',
  title: 'Bubu',
  author: 'Bubu',
  blurb: '',
  tracks: [
    track(1, 'Track One', [
      take('v1', 'v1-01-track-one-p1-takea.mp3', 'A'),
      take('v1', 'v1-01-track-one-p1-takeb.mp3', 'B'),
    ]),
    track(2, 'Track Two', [take('v1', 'v1-02-track-two-p1-takec.mp3', 'C')]),
    track(3, 'Track Three', [
      take('v1', 'v1-03-track-three-p1-takef.mp3', 'F'),
      take('v1', 'v1-03-track-three-p2-takeg.mp3', 'G'),
    ]),
    track(5, 'Track Five', [take('v1', 'v1-05-track-five-p1-takea.mp3', 'A')]),
  ],
};

const lulu: AlbumVersion = {
  slug: 'v2',
  folder: 'v2',
  title: 'Lulu',
  author: 'Lulu',
  blurb: '',
  tracks: [
    track(1, 'Track One', [take('v2', 'v2-01-track-one-p1-takec.mp3', 'C')]),
    track(4, 'Track Four', [take('v2', 'v2-04-track-four-p3-takeaa.mp3', 'AA')]),
  ],
};

const config: AlbumConfig = parseAlbumConfig({
  title: 'Fixture Album',
  artist: 'Fixture Artist',
  genre: 'Test house',
  rule: 'Small and boring.',
  sets: [
    { id: 'v1', name: 'Bubu' },
    { id: 'v2', name: 'Lulu' },
  ],
  tracks: [
    { number: 1, title: 'Track One', slug: 'track-one', listen: { set: 'v2', take: 'C' } },
    { number: 2, title: 'Track Two', slug: 'track-two' },
    {
      number: 3,
      title: 'Track Three',
      slug: 'track-three',
      listen: { set: 'v1', take: 'F' },
      vip: { set: 'v1', take: 'G', title: 'Track Three // VIP' },
    },
    {
      number: 4,
      title: 'Tr4ck F0ur',
      slug: 'track-four',
      listen: { set: 'v2', take: 'AA' },
      vip: { set: 'v2', take: 'AA' },
    },
    {
      number: 5,
      title: 'Track Five',
      slug: 'track-five',
      parked: true,
      listen: { set: 'v1', take: 'A' },
    },
    { number: 6, title: 'Track Six', slug: 'track-six', listen: { set: 'v1', take: 'A' } },
  ],
});

describe('owner final picks', () => {
  it('overrides file-backed pins without changing album.json data', () => {
    const selected = applyListenSelections(config, [
      { trackNumber: 1, slot: 'main', setId: 'v1', takeLabel: 'A' },
      { trackNumber: 3, slot: 'vip', setId: null, takeLabel: null },
    ]);

    expect(selected.tracks[0]?.listen).toEqual({ set: 'v1', take: 'A' });
    expect(selected.tracks[2]?.vip).toBeUndefined();
    expect(config.tracks[0]?.listen).toEqual({ set: 'v2', take: 'C' });
    expect(isListenFile(selected, 'v1', 'v1-01-track-one-p1-takea.mp3')).toBe(true);
    expect(isListenFile(selected, 'v2', 'v2-01-track-one-p1-takec.mp3')).toBe(false);
  });
});

describe('buildListenVersion', () => {
  it('keeps one row per pinned track in track order, with VIP rows right after', () => {
    const listen = buildListenVersion({ config, versions: [bubu, lulu] });

    expect(listen.title).toBe('Fixture Album');
    expect(listen.author).toBe('Fixture Artist');
    expect(listen.tracks.map(item => item.title)).toEqual([
      'Track One',
      'Track Three',
      'Track Three // VIP',
      'Tr4ck F0ur',
      'Tr4ck F0ur (VIP)',
    ]);
    expect(listen.tracks.map(item => item.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('plays exactly the pinned take', () => {
    const listen = buildListenVersion({ config, versions: [bubu, lulu] });

    const one = listen.tracks.find(item => item.title === 'Track One');
    expect(one?.takes.map(item => [item.versionSlug, item.voteLabel])).toEqual([['v2', 'C']]);
    expect(one?.audioUrl).toBe('/api/audio/v2/v2-01-track-one-p1-takec.mp3');
    expect(one?.takes[0]?.label).toBe('Lulu C');

    const vip = listen.tracks.find(item => item.title === 'Track Three // VIP');
    expect(vip?.takes.map(item => item.voteLabel)).toEqual(['G']);
    expect(vip?.parkedTakes).toEqual([]);
  });

  it('leaves out unpinned and parked tracks, and pins whose take is missing', () => {
    const listen = buildListenVersion({ config, versions: [bubu, lulu] });

    const titles = listen.tracks.map(item => item.title);
    expect(titles).not.toContain('Track Two');
    expect(titles).not.toContain('Track Five');
    expect(titles).not.toContain('Track Six');
  });

  it('is empty when nothing is pinned', () => {
    const empty = parseAlbumConfig({
      ...config,
      tracks: [{ number: 1, title: 'Track One', slug: 'track-one' }],
    });

    expect(buildListenVersion({ config: empty, versions: [bubu] }).tracks).toEqual([]);
  });
});

describe('findListenTrack', () => {
  const listen = buildListenVersion({ config, versions: [bubu, lulu] });

  it('finds a row by its album.json slug, its VIP slug, its title or its number', () => {
    expect(findListenTrack({ listen, config, trackSlug: 'track-four' })?.title).toBe('Tr4ck F0ur');
    expect(findListenTrack({ listen, config, trackSlug: 'track-four-vip' })?.title).toBe(
      'Tr4ck F0ur (VIP)'
    );
    expect(findListenTrack({ listen, config, trackSlug: 'tr4ck-f0ur' })?.title).toBe('Tr4ck F0ur');
    expect(findListenTrack({ listen, config, trackSlug: 'track-three-vip' })?.title).toBe(
      'Track Three // VIP'
    );
    expect(findListenTrack({ listen, config, trackSlug: '2' })?.title).toBe('Track Three');
  });

  it('returns null for tracks that are not on Listen', () => {
    expect(findListenTrack({ listen, config, trackSlug: 'track-two' })).toBeNull();
    expect(findListenTrack({ listen, config, trackSlug: 'missing' })).toBeNull();
  });
});

describe('isListenFile', () => {
  it('opens only the pinned listen and vip takes', () => {
    expect(isListenFile(config, 'v2', 'v2-01-track-one-p1-takec.mp3')).toBe(true);
    expect(isListenFile(config, 'v1', 'v1-03-track-three-p1-takef.mp3')).toBe(true);
    expect(isListenFile(config, 'v1', 'v1-03-track-three-p2-takeg.mp3')).toBe(true);
    expect(isListenFile(config, 'v2', 'v2-04-track-four-p3-takeaa.mp3')).toBe(true);
  });

  it('keeps every other file owner only', () => {
    expect(isListenFile(config, 'v1', 'v1-01-track-one-p1-takea.mp3')).toBe(false);
    expect(isListenFile(config, 'v1', 'v2-01-track-one-p1-takec.mp3')).toBe(false);
    expect(isListenFile(config, 'v1', 'v1-02-track-two-p1-takec.mp3')).toBe(false);
    expect(isListenFile(config, 'v1', 'v1-05-track-five-p1-takea.mp3')).toBe(false);
    expect(isListenFile(config, 'v1', 'v1-09-track-nine-p1-takea.mp3')).toBe(false);
    expect(isListenFile(config, 'v2', 'v2-01-track-one-takec.mp3')).toBe(false);
  });
});
