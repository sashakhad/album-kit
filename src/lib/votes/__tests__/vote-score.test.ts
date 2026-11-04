import { describe, expect, it } from 'vitest';

import { isTakeVisibleInPass, votesForCurrentPass } from '@/lib/votes/pass';

describe('repeat vote pass filtering', () => {
  it('keeps a take with a positive prior-round net score', () => {
    expect(
      isTakeVisibleInPass({
        currentRound: 2,
        versionSlug: 'v1',
        trackNumber: 14,
        takeLabel: 'P',
        votes: [
          {
            versionSlug: 'v1',
            trackNumber: 14,
            takeLabel: 'P',
            round: 1,
            value: 4,
          },
        ],
      })
    ).toBe(true);
  });

  it('carries a prior positive into the current pass tally and leaves zeros out', () => {
    expect(
      votesForCurrentPass(
        [
          { versionSlug: 'v1', trackNumber: 24, takeLabel: 'A', round: 9, value: 2 },
          { versionSlug: 'v2', trackNumber: 23, takeLabel: 'A', round: 9, value: 2 },
          { versionSlug: 'v1', trackNumber: 1, takeLabel: 'B', round: 8, value: 0 },
          { versionSlug: 'v1', trackNumber: 1, takeLabel: 'C', round: 8, value: -2 },
          { versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', round: 10, value: 4 },
        ],
        10
      )
    ).toEqual([
      { versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', round: 10, value: 4 },
      { versionSlug: 'v1', trackNumber: 24, takeLabel: 'A', value: 2, round: 10 },
      { versionSlug: 'v2', trackNumber: 23, takeLabel: 'A', value: 2, round: 10 },
    ]);
  });

  it('drops a take with a negative prior-round net score', () => {
    expect(
      isTakeVisibleInPass({
        currentRound: 2,
        versionSlug: 'v1',
        trackNumber: 14,
        takeLabel: 'P',
        votes: [
          {
            versionSlug: 'v1',
            trackNumber: 14,
            takeLabel: 'P',
            round: 1,
            value: -3,
          },
        ],
      })
    ).toBe(false);
  });
});
