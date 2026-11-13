import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const streamState = vi.hoisted(() => ({
  rows: [] as Array<{ filename: string; clipId: string; streamUrl: string }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/album/stream-catalog', () => ({
  loadStreamCatalog: async () => streamState.rows,
}));

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function useFixture(name: string): void {
  vi.spyOn(process, 'cwd').mockReturnValue(path.join(fixturesRoot, name));
}

describe('listSets', () => {
  beforeEach(() => {
    streamState.rows = [];
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    vi.stubEnv('BLOB_STORE_ID', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('loads three local files as one set with two tracks', async () => {
    useFixture('three-takes');
    const { listSets } = await import('../load-album');

    const sets = await listSets();

    expect(sets).toHaveLength(1);
    const set = sets[0];
    expect(set?.slug).toBe('v1');
    expect(set?.folder).toBe('v1');
    expect(set?.title).toBe('Bubu');
    expect(set?.author).toBe('Bubu');

    const albumTracks = set?.tracks.filter(track => track.kind === 'album') ?? [];
    expect(albumTracks.map(track => [track.number, track.title])).toEqual([
      [1, 'Track One'],
      [2, 'Track Two'],
    ]);
    expect(albumTracks[0]?.takes.map(take => take.label)).toEqual(['A', 'B']);
    expect(albumTracks[0]?.audioUrl).toBe('/api/audio/v1/v1-01-track-one-p1-takea.mp3');
    expect(albumTracks[0]?.prompt).toBeNull();
    expect(albumTracks[1]?.takes.map(take => take.filename)).toEqual([
      'v1-02-track-two-p1-takea.mp3',
    ]);
    expect(set?.tracks.some(track => track.kind === 'bonus')).toBe(false);
  });

  it('keeps the album.json set order, drops unknown sets and leaves parked tracks out', async () => {
    useFixture('mixed');
    const { listSets } = await import('../load-album');

    const sets = await listSets();

    expect(sets.map(set => set.slug)).toEqual(['v2', 'v1']);
    expect(sets.find(set => set.slug === 'v1')?.blurb).toBe('First prompt set.');

    const filenames = sets.flatMap(set =>
      set.tracks.flatMap(track => track.takes.map(take => take.filename))
    );
    expect(filenames).not.toContain('v3-01-track-one-p1-takea.mp3');
    expect(filenames).not.toContain('notes.txt');

    for (const set of sets) {
      const albumTracks = set.tracks.filter(track => track.kind === 'album');
      expect(albumTracks.map(track => track.number)).toEqual([1]);
    }
    const lulu = sets.find(set => set.slug === 'v2');
    expect(lulu?.tracks[0]?.takes.map(take => [take.label, take.filename])).toEqual([
      ['B', 'v2-01-track-one-p2-takeb.mp3'],
    ]);
  });

  it('returns an empty set when there is no audio folder', async () => {
    useFixture('no-audio');
    const { listSets } = await import('../load-album');

    const sets = await listSets();

    expect(sets).toHaveLength(1);
    expect(sets[0]?.tracks).toEqual([]);
  });

  it('reads takes from Blob when the token is set', async () => {
    useFixture('three-takes');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_test');
    vi.doMock('@/lib/album/blob-audio', () => ({
      canUseBlob: () => true,
      listBlobTakeFilenames: async () => ['v1-02-track-two-p4-takeg.mp3'],
    }));
    vi.resetModules();
    const { listSets } = await import('../load-album');

    const sets = await listSets();

    const albumTracks = sets[0]?.tracks.filter(track => track.kind === 'album') ?? [];
    expect(albumTracks[0]?.takes).toEqual([]);
    expect(albumTracks[1]?.takes.map(take => take.label)).toEqual(['G']);
    vi.doUnmock('@/lib/album/blob-audio');
    vi.resetModules();
  });

  it('plays a stored stream and includes a take that has no uploaded file', async () => {
    useFixture('three-takes');
    vi.resetModules();
    const clipId = 'clip-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const onlyStream = 'v1-02-track-two-p2-takeb.mp3';
    streamState.rows = [
      {
        filename: 'v1-01-track-one-p1-takea.mp3',
        clipId,
        streamUrl: `https://cdn1.suno.ai/${clipId}.mp3`,
      },
      {
        filename: onlyStream,
        clipId: 'clip-bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
        streamUrl: 'https://cdn1.suno.ai/clip-bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee.mp3',
      },
    ];
    const { listSets } = await import('../load-album');

    const sets = await listSets();
    const tracks = sets[0]?.tracks.filter(track => track.kind === 'album') ?? [];
    expect(tracks[0]?.takes.find(take => take.label === 'A')?.audioUrl).toBe(
      `https://cdn1.suno.ai/${clipId}.mp3`
    );
    expect(tracks[0]?.takes.find(take => take.label === 'B')?.audioUrl).toBe(
      '/api/audio/v1/v1-01-track-one-p1-takeb.mp3'
    );
    expect(tracks[1]?.takes.map(take => [take.label, take.audioUrl])).toEqual([
      ['A', '/api/audio/v1/v1-02-track-two-p1-takea.mp3'],
      ['B', 'https://cdn1.suno.ai/clip-bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee.mp3'],
    ]);
  });
});

describe('getSet', () => {
  beforeEach(() => {
    streamState.rows = [];
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    vi.stubEnv('BLOB_STORE_ID', '');
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('finds a set by id and returns null for an unknown one', async () => {
    useFixture('three-takes');
    const { getSet } = await import('../load-album');

    expect((await getSet('v1'))?.title).toBe('Bubu');
    expect(await getSet('v9')).toBeNull();
  });
});
