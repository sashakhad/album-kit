import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlbumVersion } from '@/lib/album/types';

const state = vi.hoisted(() => ({
  rows: new Map<string, { round: number; trackNumber: number; filenames: string[] }>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({ albumKey: () => 'secret' }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    blindOrder: {
      findUnique: async ({
        where,
      }: {
        where: { round_trackNumber: { round: number; trackNumber: number } };
      }) =>
        state.rows.get(`${where.round_trackNumber.round}:${where.round_trackNumber.trackNumber}`) ??
        null,
      upsert: async ({
        create,
      }: {
        create: { round: number; trackNumber: number; filenames: string[] };
      }) => {
        const key = `${create.round}:${create.trackNumber}`;
        if (!state.rows.has(key)) state.rows.set(key, create);
        return state.rows.get(key);
      },
      update: async ({
        where,
        data,
      }: {
        where: { round_trackNumber: { round: number; trackNumber: number } };
        data: { filenames: string[] };
      }) => {
        const key = `${where.round_trackNumber.round}:${where.round_trackNumber.trackNumber}`;
        state.rows.set(key, { ...state.rows.get(key)!, filenames: data.filenames });
      },
      findMany: async ({ where }: { where: { round: number } }) =>
        Array.from(state.rows.values()).filter(row => row.round === where.round),
    },
  },
}));

import { blindVersion, blindSnapshot, filenameForOpaqueId, realTakeForAlias } from '../blind';

const first = 'v1-01-track-one-p1-takea.mp3';
const second = 'v1-01-track-one-p2-takeb.mp3';
const version: AlbumVersion = {
  slug: 'pass',
  folder: 'pass',
  title: 'Round 1',
  author: '',
  blurb: '',
  tracks: [
    {
      number: 1,
      title: 'Track One',
      kind: 'album',
      filename: first,
      audioUrl: `/api/audio/v1/${first}`,
      prompt: 'secret style',
      takes: [
        {
          label: 'A',
          voteLabel: 'A',
          versionSlug: 'v1',
          filename: first,
          audioUrl: `/api/audio/v1/${first}`,
        },
        {
          label: 'B',
          voteLabel: 'B',
          versionSlug: 'v1',
          filename: second,
          audioUrl: `/api/audio/v1/${second}`,
        },
      ],
    },
  ],
};

beforeEach(() => state.rows.clear());

describe('blind voting', () => {
  it('saves a stable shuffled order and removes identifying metadata from the payload', async () => {
    const hidden = await blindVersion(version, 1);
    const again = await blindVersion(version, 1);
    expect(hidden.tracks[0]?.takes.map(take => take.audioUrl)).toEqual(
      again.tracks[0]?.takes.map(take => take.audioUrl)
    );
    expect(hidden.tracks[0]?.takes.map(take => take.label)).toEqual(['A', 'B']);
    expect(JSON.stringify(hidden)).not.toContain('p1-takea');
    expect(JSON.stringify(hidden)).not.toContain('p2-takeb');
    expect(JSON.stringify(hidden)).not.toContain('secret style');
    const token = hidden.tracks[0]?.takes[0]?.filename;
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(await filenameForOpaqueId(1, token!)).not.toBeNull();
  });

  it('maps displayed votes back to the saved take without sending the real letter', async () => {
    const hidden = await blindVersion(version, 1);
    const alias = hidden.tracks[0]!.takes[0]!.voteLabel;
    const real = await realTakeForAlias({
      round: 1,
      trackNumber: 1,
      versionSlug: 'v1',
      alias,
      takes: version.tracks[0]!.takes,
    });
    expect(real).not.toBeNull();
    const snapshot = await blindSnapshot({
      currentRound: 1,
      tallies: { 1: { v1: { A: 1, B: -1 } } },
      listenerTallies: { 1: { v1: { [real!.voteLabel]: 3 } } },
      mine: { 1: [{ versionSlug: 'v1', takeLabel: real!.voteLabel, value: 1, round: 1 }] },
      downloads: {},
      versionTotals: { v1: 0 },
    });
    expect(snapshot.mine[1]?.[0]?.takeLabel).toBe(alias);
    expect(snapshot.listenerTallies?.[1]?.v1?.[alias]).toBe(3);
  });
});
