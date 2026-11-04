import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadAlbumConfig, parseAlbumConfig } from '../album-config';

function validConfig(): Record<string, unknown> {
  return {
    title: 'Fixture Album',
    artist: 'Fixture Artist',
    genre: 'Test house',
    rule: 'Funny titles, serious records.',
    sets: [
      { id: 'v1', name: 'Bubu' },
      { id: 'v2', name: 'Lulu', blurb: 'Second prompt set.' },
    ],
    tracks: [
      { number: 3, title: 'Track Three', slug: 'track-three', parked: true },
      {
        number: 1,
        title: 'Track One',
        slug: 'track-one',
        listen: { set: 'v1', take: 'B' },
        vip: { set: 'v2', take: 'AA', title: 'Track One // VIP' },
      },
    ],
  };
}

function withTrack(track: Record<string, unknown>): Record<string, unknown> {
  return { ...validConfig(), tracks: [track] };
}

describe('parseAlbumConfig', () => {
  it('accepts a full config and sorts tracks by number', () => {
    const config = parseAlbumConfig(validConfig());

    expect(config.tracks.map(track => track.number)).toEqual([1, 3]);
    expect(config.tracks[0]?.listen).toEqual({ set: 'v1', take: 'B' });
    expect(config.tracks[0]?.vip?.title).toBe('Track One // VIP');
    expect(config.tracks[1]?.parked).toBe(true);
    expect(config.sets[1]?.blurb).toBe('Second prompt set.');
  });

  it('accepts the starter file', () => {
    const config = parseAlbumConfig({
      title: 'Untitled album',
      artist: '',
      genre: '',
      rule: '',
      sets: [{ id: 'v1', name: 'Bubu' }],
      tracks: [],
    });

    expect(config.sets).toEqual([{ id: 'v1', name: 'Bubu' }]);
    expect(config.tracks).toEqual([]);
  });

  it('names the bad field', () => {
    expect(() => parseAlbumConfig({ ...validConfig(), title: '' })).toThrow(/title: /);
    expect(() => parseAlbumConfig({ ...validConfig(), sets: [] })).toThrow(/sets: /);
    expect(() =>
      parseAlbumConfig({ ...validConfig(), sets: [{ id: 'one', name: 'Bubu' }] })
    ).toThrow(/sets\[0\]\.id: must look like v1/);
    expect(() =>
      parseAlbumConfig(withTrack({ number: 100, title: 'Too Far', slug: 'too-far' }))
    ).toThrow(/tracks\[0\]\.number: /);
    expect(() => parseAlbumConfig(withTrack({ number: 1.5, title: 'Half', slug: 'half' }))).toThrow(
      /tracks\[0\]\.number: /
    );
    expect(() => parseAlbumConfig(withTrack({ number: 1, title: '', slug: 'empty' }))).toThrow(
      /tracks\[0\]\.title: /
    );
    expect(() =>
      parseAlbumConfig(withTrack({ number: 1, title: 'Track One', slug: 'Track One' }))
    ).toThrow(/tracks\[0\]\.slug: /);
    expect(() =>
      parseAlbumConfig(withTrack({ number: 1, title: 'Track One', slug: 'track--one' }))
    ).toThrow(/tracks\[0\]\.slug: /);
    expect(() =>
      parseAlbumConfig(
        withTrack({
          number: 1,
          title: 'Track One',
          slug: 'track-one',
          listen: { set: 'v1', take: 'b' },
        })
      )
    ).toThrow(/tracks\[0\]\.listen\.take: /);
    expect(() =>
      parseAlbumConfig(
        withTrack({
          number: 1,
          title: 'Track One',
          slug: 'track-one',
          listen: { set: 'v9', take: 'B' },
        })
      )
    ).toThrow(/tracks\[0\]\.listen\.set: names set v9/);
    expect(() =>
      parseAlbumConfig(
        withTrack({
          number: 1,
          title: 'Track One',
          slug: 'track-one',
          vip: { set: 'v9', take: 'C' },
        })
      )
    ).toThrow(/tracks\[0\]\.vip\.set: /);
    expect(() => parseAlbumConfig({ ...validConfig(), artist: undefined })).toThrow(/artist: /);
  });

  it('rejects repeated set ids, track numbers and slugs', () => {
    expect(() =>
      parseAlbumConfig({
        ...validConfig(),
        sets: [
          { id: 'v1', name: 'Bubu' },
          { id: 'v1', name: 'Lulu' },
        ],
      })
    ).toThrow(/sets\[1\]\.id: repeats v1/);
    expect(() =>
      parseAlbumConfig({
        ...validConfig(),
        tracks: [
          { number: 1, title: 'Track One', slug: 'track-one' },
          { number: 1, title: 'Track Uno', slug: 'track-uno' },
        ],
      })
    ).toThrow(/tracks\[1\]\.number: repeats 1/);
    expect(() =>
      parseAlbumConfig({
        ...validConfig(),
        tracks: [
          { number: 1, title: 'Track One', slug: 'track-one' },
          { number: 2, title: 'Track One Again', slug: 'track-one' },
        ],
      })
    ).toThrow(/tracks\[1\]\.slug: repeats track-one/);
  });
});

describe('loadAlbumConfig', () => {
  let tempRoot: string | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempRoot !== null) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  async function useAlbumJson(text: string): Promise<void> {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'album-config-'));
    await mkdir(path.join(tempRoot, 'album'));
    await writeFile(path.join(tempRoot, 'album', 'album.json'), text);
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
  }

  it('reads album/album.json under the working directory', async () => {
    await useAlbumJson(JSON.stringify(validConfig()));

    const config = await loadAlbumConfig();

    expect(config.title).toBe('Fixture Album');
    expect(config.tracks.map(track => track.slug)).toEqual(['track-one', 'track-three']);
  });

  it('reads the starter file that ships with the kit', async () => {
    const config = await loadAlbumConfig();

    expect(config.title).toBe('Untitled album');
    expect(config.sets).toEqual([{ id: 'v1', name: 'Bubu' }]);
    expect(config.tracks).toEqual([]);
  });

  it('says when the file is not JSON', async () => {
    await useAlbumJson('{ "title": ');

    await expect(loadAlbumConfig()).rejects.toThrow(/album\/album\.json is not valid JSON/);
  });

  it('says which field is bad', async () => {
    await useAlbumJson(JSON.stringify({ ...validConfig(), sets: [{ id: 'x1', name: 'Bubu' }] }));

    await expect(loadAlbumConfig()).rejects.toThrow(/sets\[0\]\.id/);
  });
});
