// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  round: 1 as number | null,
  latest: 1,
  carriedWrites: 0,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => {
  const db = {
    visitorRound: {
      findUnique: async () => (state.round === null ? null : { currentRound: state.round }),
      updateMany: async ({ where }: { where: { currentRound: number } }) => {
        await Promise.resolve();
        if (state.round !== where.currentRound) return { count: 0 };
        state.round += 1;
        return { count: 1 };
      },
      create: async ({ data }: { data: { currentRound: number } }) => {
        if (state.round !== null) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        state.round = data.currentRound;
        return { currentRound: data.currentRound };
      },
    },
    vote: {
      findMany: async () => [
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', round: 1, value: 1 },
      ],
      createMany: async () => {
        state.carriedWrites += 1;
        return { count: 1 };
      },
    },
    judgingState: {
      upsert: async () => ({ latestRound: state.latest }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { latestRound: { lt: number } };
        data: { latestRound: number };
      }) => {
        if (state.latest < where.latestRound.lt) state.latest = data.latestRound;
        return { count: 1 };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { getPrisma: () => db };
});

import { advanceVisitorRound, PassAlreadyChangedError } from '@/lib/votes/pass-store';

beforeEach(() => {
  state.round = 1;
  state.latest = 1;
  state.carriedWrites = 0;
});

describe('atomic pass advancement', () => {
  it('lets only one simultaneous expected-round request advance and carry votes', async () => {
    const outcomes = await Promise.allSettled([
      advanceVisitorRound('owner', 1),
      advanceVisitorRound('owner', 1),
    ]);
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(
      outcomes.filter(
        item => item.status === 'rejected' && item.reason instanceof PassAlreadyChangedError
      )
    ).toHaveLength(1);
    expect(state.round).toBe(2);
    expect(state.carriedWrites).toBe(1);
  });

  it('handles concurrent first-pass requests when the round row does not exist yet', async () => {
    state.round = null;
    const outcomes = await Promise.allSettled([
      advanceVisitorRound('owner', 1),
      advanceVisitorRound('owner', 1),
    ]);
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(
      outcomes.filter(
        item => item.status === 'rejected' && item.reason instanceof PassAlreadyChangedError
      )
    ).toHaveLength(1);
    expect(state.round).toBe(2);
  });
});
