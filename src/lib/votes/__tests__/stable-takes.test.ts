import { describe, expect, it } from 'vitest';

import type { AlbumVersion } from '@/lib/album/types';
import { remapSnapshotToStableTakes, stableTakeRefs } from '@/lib/votes/stable-takes';
import type { VoteSnapshot } from '@/lib/votes/types';

const trap = 'G minor, 128 BPM, trap drums and a wide EDM lead.';

function version(labels: { id: string; label: string }[]): AlbumVersion {
  return {
    slug: 'v1',
    folder: 'v1',
    title: 'krillAF',
    author: '',
    blurb: '',
    tracks: [
      {
        number: 1,
        title: 'krillAF',
        kind: 'album',
        filename: null,
        audioUrl: '/trap.mp4',
        prompt: null,
        takes: labels.map(item => ({
          label: item.label,
          voteLabel: item.label,
          stableId: item.id,
          filename: `${item.id}.mp3`,
          audioUrl: item.id === 'trap-recording' ? '/trap.mp4' : '/sibling.mp4',
          versionSlug: 'v1',
          ...(item.id === 'trap-recording' ? { prompt: trap } : {}),
        })),
      },
    ],
  };
}

const shuffled = version([
  { id: 'trap-recording', label: 'H' },
  { id: 'sibling-recording', label: 'A' },
]);
const revealed = version([
  { id: 'trap-recording', label: 'C' },
  { id: 'sibling-recording', label: 'H' },
]);

const snapshot: VoteSnapshot = {
  currentRound: 1,
  tallies: { 1: { v1: { H: 1, A: -1 } } },
  listenerTallies: { 1: { v1: { H: 2 } } },
  mine: { 1: [{ versionSlug: 'v1', takeLabel: 'H', value: 1, round: 1 }] },
  downloads: { 1: [{ versionSlug: 'v1', takeLabel: 'A', round: 1 }] },
  versionTotals: { v1: 0 },
};

describe('stable take votes', () => {
  it('moves a score from a shuffled letter onto the same recording after reveal', () => {
    const next = remapSnapshotToStableTakes(
      snapshot,
      stableTakeRefs(shuffled),
      stableTakeRefs(revealed)
    );
    expect(next.mine[1]?.[0]).toMatchObject({ takeLabel: 'C', value: 1 });
    expect(next.tallies[1]?.v1).toEqual({ C: 1, H: -1 });
    expect(next.listenerTallies?.[1]?.v1).toEqual({ C: 2 });
    expect(next.downloads[1]?.[0]?.takeLabel).toBe('H');
    expect(
      remapSnapshotToStableTakes(next, stableTakeRefs(revealed), stableTakeRefs(revealed))
    ).toBe(next);
  });
});
