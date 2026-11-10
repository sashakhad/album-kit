// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: { listeningExposure: { findUnique: async () => null } },
}));
vi.mock('@/lib/votes/pass-store', () => ({
  getConsolidatedPassVersion: async () => ({
    tracks: [{ number: 1, takes: [{ versionSlug: 'v1', voteLabel: 'A' }] }],
  }),
}));

import { isBlindForSnapshot } from '@/lib/votes/exposure';
import type { VoteSnapshot } from '@/lib/votes/types';

const snapshot: VoteSnapshot = {
  tallies: {},
  downloads: {},
  versionTotals: {},
  currentRound: 1,
  mine: { 1: [{ versionSlug: 'v1', takeLabel: 'A', value: 1, round: 1 }] },
};

describe('listening exposure', () => {
  it('switches reveal-after-vote to canonical labels once every take has a vote', async () => {
    expect(await isBlindForSnapshot('owner', 'reveal-after-vote', snapshot)).toBe(false);
    expect(await isBlindForSnapshot('owner', 'reveal-after-vote', { ...snapshot, mine: {} })).toBe(
      true
    );
  });

  it('keeps hidden mode blind even after all takes are voted', async () => {
    expect(await isBlindForSnapshot('owner', 'keep-hidden', snapshot)).toBe(true);
  });
});
