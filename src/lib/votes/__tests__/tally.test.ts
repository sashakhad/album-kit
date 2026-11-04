import { describe, expect, it } from 'vitest';

import {
  choiceForTake,
  countForTake,
  countForTrackVersion,
  isDownloaded,
  leadingTakes,
} from '@/lib/votes/tally';
import type { VoteSnapshot } from '@/lib/votes/types';

const snapshot: VoteSnapshot = {
  tallies: {
    1: { v2: { A: 4, B: 1 }, v3: { A: 2 } },
    2: { v1: { C: 1 } },
  },
  mine: { 1: [{ versionSlug: 'v2', takeLabel: 'B', value: 3, round: 1 }] },
  downloads: { 1: [{ versionSlug: 'v2', takeLabel: 'B', round: 1 }] },
  versionTotals: { v2: 5, v3: 2, v1: 1 },
  currentRound: 1,
};

describe('vote tally helpers', () => {
  it('reads a take count for a track', () => {
    expect(countForTake(snapshot, 1, 'v2', 'A')).toBe(4);
    expect(countForTake(snapshot, 1, 'v2', 'B')).toBe(1);
    expect(countForTake(snapshot, 1, 'v1', 'A')).toBe(0);
    expect(countForTake(snapshot, 9, 'v2', 'A')).toBe(0);
  });

  it('knows which takes this visitor already saved', () => {
    expect(isDownloaded(snapshot, 1, 'v2', 'B')).toBe(true);
    expect(isDownloaded(snapshot, 1, 'v2', 'A')).toBe(false);
    expect(isDownloaded(snapshot, 2, 'v1', 'C')).toBe(false);
  });

  it('returns the visitor net score for a take', () => {
    expect(choiceForTake(snapshot, 1, 'v2', 'B')).toBe(3);
    expect(choiceForTake(snapshot, 1, 'v2', 'A')).toBe(0);
  });

  it('sums takes for a version', () => {
    expect(countForTrackVersion(snapshot, 1, 'v2')).toBe(5);
    expect(countForTrackVersion(snapshot, 1, 'v1')).toBe(0);
  });

  it('returns the leading takes and keeps ties', () => {
    expect(leadingTakes({ v2: { A: 3, B: 1 }, v3: { A: 1 } })).toEqual([
      { versionSlug: 'v2', takeLabel: 'A', count: 3 },
    ]);
    expect(leadingTakes({ v2: { A: 2 }, v3: { C: 2 }, v1: { A: 1 } })).toEqual([
      { versionSlug: 'v2', takeLabel: 'A', count: 2 },
      { versionSlug: 'v3', takeLabel: 'C', count: 2 },
    ]);
    expect(leadingTakes({ v2: { A: 0 } })).toEqual([]);
    expect(leadingTakes({ v2: { A: -2 }, v3: { B: -5 } })).toEqual([
      { versionSlug: 'v2', takeLabel: 'A', count: -2 },
    ]);
  });
});
