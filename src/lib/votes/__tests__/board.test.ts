import { beforeEach, describe, expect, it, vi } from 'vitest';

type VoteRow = {
  id: string;
  visitorId: string;
  trackNumber: number;
  versionSlug: string;
  takeLabel: string;
  value: number;
  round: number;
};

const rows: VoteRow[] = [];
let mockRound = 1;

vi.mock('server-only', () => ({}));
vi.mock('@/lib/votes/exposure', () => ({ wasExposed: async () => false }));
vi.mock('@/lib/votes/pass-store', () => ({
  getVisitorCurrentRound: async () => mockRound,
}));
vi.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    vote: {
      findMany: async (args?: {
        where?: {
          visitorId?: string | { startsWith: string };
          round?: number;
        };
      }) =>
        rows
          .filter(row => {
            const where = args?.where;
            if (where === undefined) {
              return true;
            }
            if (typeof where.visitorId === 'string' && row.visitorId !== where.visitorId) {
              return false;
            }
            if (
              typeof where.visitorId === 'object' &&
              !row.visitorId.startsWith(where.visitorId.startsWith)
            ) {
              return false;
            }
            if (where.round !== undefined && row.round !== where.round) {
              return false;
            }
            return true;
          })
          .map(row => ({ ...row })),
      upsert: async (args: {
        where: {
          visitorId_trackNumber_versionSlug_takeLabel_round: {
            visitorId: string;
            trackNumber: number;
            versionSlug: string;
            takeLabel: string;
            round: number;
          };
        };
        create: {
          visitorId: string;
          trackNumber: number;
          versionSlug: string;
          takeLabel: string;
          value: number;
          round: number;
        };
        update: { value: { increment: number } };
      }) => {
        const key = args.where.visitorId_trackNumber_versionSlug_takeLabel_round;
        const existing = rows.find(
          row =>
            row.visitorId === key.visitorId &&
            row.trackNumber === key.trackNumber &&
            row.versionSlug === key.versionSlug &&
            row.takeLabel === key.takeLabel &&
            row.round === key.round
        );
        if (existing === undefined) {
          rows.push({
            id: `vote-${rows.length + 1}`,
            visitorId: args.create.visitorId,
            trackNumber: args.create.trackNumber,
            versionSlug: args.create.versionSlug,
            takeLabel: args.create.takeLabel,
            value: args.create.value,
            round: args.create.round,
          });
          return;
        }
        existing.value += args.update.value.increment;
      },
    },
    download: {
      findMany: async () => [],
    },
  }),
}));

describe('castVote', () => {
  beforeEach(() => {
    rows.length = 0;
    mockRound = 1;
  });

  it('lets the owner vote each take on its own', async () => {
    const { castVote } = await import('@/lib/votes/board');

    const first = await castVote({
      visitorId: 'owner',
      trackNumber: 1,
      versionSlug: 'v2',
      takeLabel: 'A',
      value: 1,
    });
    expect(first.mine[1]).toEqual([{ versionSlug: 'v2', takeLabel: 'A', value: 1, round: 1 }]);
    expect(first.tallies[1]?.v2?.A).toBe(1);

    const otherTake = await castVote({
      visitorId: 'owner',
      trackNumber: 1,
      versionSlug: 'v2',
      takeLabel: 'B',
      value: -1,
    });
    expect(otherTake.mine[1]).toEqual([
      { versionSlug: 'v2', takeLabel: 'A', value: 1, round: 1 },
      { versionSlug: 'v2', takeLabel: 'B', value: -1, round: 1 },
    ]);
    expect(otherTake.tallies[1]?.v2?.A).toBe(1);
    expect(otherTake.tallies[1]?.v2?.B).toBe(-1);
  });

  it('adds every upvote and downvote click to the same take', async () => {
    const { castVote } = await import('@/lib/votes/board');

    await castVote({
      visitorId: 'owner',
      trackNumber: 3,
      versionSlug: 'v2',
      takeLabel: 'C',
      value: 1,
    });
    const secondUp = await castVote({
      visitorId: 'owner',
      trackNumber: 3,
      versionSlug: 'v2',
      takeLabel: 'C',
      value: 1,
    });

    expect(secondUp.mine[3]).toEqual([{ versionSlug: 'v2', takeLabel: 'C', value: 2, round: 1 }]);
    expect(secondUp.tallies[3]?.v2?.C).toBe(2);

    const down = await castVote({
      visitorId: 'owner',
      trackNumber: 3,
      versionSlug: 'v2',
      takeLabel: 'C',
      value: -1,
    });

    expect(down.mine[3]).toEqual([{ versionSlug: 'v2', takeLabel: 'C', value: 1, round: 1 }]);
    expect(down.tallies[3]?.v2?.C).toBe(1);
    expect(down.versionTotals.v2).toBe(1);
  });

  it('allows repeated downvotes below minus one', async () => {
    const { castVote } = await import('@/lib/votes/board');

    await castVote({
      visitorId: 'owner',
      trackNumber: 2,
      versionSlug: 'v1',
      takeLabel: 'A',
      value: -1,
    });
    const secondDown = await castVote({
      visitorId: 'owner',
      trackNumber: 2,
      versionSlug: 'v1',
      takeLabel: 'A',
      value: -1,
    });

    expect(secondDown.mine[2]).toEqual([
      { versionSlug: 'v1', takeLabel: 'A', value: -2, round: 1 },
    ]);
    expect(secondDown.tallies[2]?.v1?.A).toBe(-2);
    expect(secondDown.versionTotals.v1).toBe(-2);
  });

  it('starts a new round from the carried positive score', async () => {
    mockRound = 2;
    rows.push({
      id: 'vote-carried',
      visitorId: 'owner',
      trackNumber: 4,
      versionSlug: 'v1',
      takeLabel: 'B',
      value: 2,
      round: 1,
    });
    const { castVote } = await import('@/lib/votes/board');

    const snapshot = await castVote({
      visitorId: 'owner',
      trackNumber: 4,
      versionSlug: 'v1',
      takeLabel: 'B',
      value: 1,
    });

    expect(snapshot.mine[4]).toEqual([{ versionSlug: 'v1', takeLabel: 'B', value: 3, round: 2 }]);
  });
});

describe('getVoteSnapshot', () => {
  beforeEach(() => {
    rows.length = 0;
    mockRound = 1;
  });

  it('carries a prior-round positive onto the new pass', async () => {
    mockRound = 10;
    rows.push({
      id: 'vote-twenty-four',
      visitorId: 'owner',
      trackNumber: 24,
      versionSlug: 'v1',
      takeLabel: 'A',
      value: 2,
      round: 9,
    });

    const { getVoteSnapshot } = await import('@/lib/votes/board');
    const snapshot = await getVoteSnapshot('owner');

    expect(snapshot.currentRound).toBe(10);
    expect(snapshot.tallies[24]?.v1?.A).toBe(2);
    expect(snapshot.mine[24]).toEqual([{ versionSlug: 'v1', takeLabel: 'A', value: 2, round: 10 }]);
  });

  it('keeps listener votes out of the owner tally and score', async () => {
    rows.push({
      id: 'listener-vote',
      visitorId: 'listener:abc',
      trackNumber: 1,
      versionSlug: 'v1',
      takeLabel: 'A',
      value: 4,
      round: 1,
    });
    rows.push({
      id: 'owner-vote',
      visitorId: 'owner',
      trackNumber: 1,
      versionSlug: 'v1',
      takeLabel: 'A',
      value: 1,
      round: 1,
    });

    const { getVoteSnapshot } = await import('@/lib/votes/board');
    const owner = await getVoteSnapshot('owner');
    const listener = await getVoteSnapshot('listener:abc', { round: 1, carry: false });

    expect(owner.tallies[1]?.v1?.A).toBe(1);
    expect(owner.mine[1]).toEqual([{ versionSlug: 'v1', takeLabel: 'A', value: 1, round: 1 }]);
    expect(owner.listenerTallies?.[1]?.v1?.A).toBe(4);
    expect(listener.tallies[1]?.v1?.A).toBe(4);
    expect(listener.listenerTallies).toBeUndefined();
    expect(listener.mine[1]).toEqual([{ versionSlug: 'v1', takeLabel: 'A', value: 4, round: 1 }]);
  });
});

describe('listener vote cap', () => {
  beforeEach(() => {
    rows.length = 0;
    mockRound = 1;
  });

  it('stops a listener from pushing one take past the cap and leaves the owner uncapped', async () => {
    rows.push({
      id: 'capped',
      visitorId: 'listener:abc',
      trackNumber: 1,
      versionSlug: 'v1',
      takeLabel: 'A',
      value: 20,
      round: 1,
    });
    const { castVote } = await import('@/lib/votes/board');
    const { ListenerVoteLimitError } = await import('@/lib/votes/abuse');

    await expect(
      castVote({
        visitorId: 'listener:abc',
        trackNumber: 1,
        versionSlug: 'v1',
        takeLabel: 'A',
        value: 1,
        round: 1,
      })
    ).rejects.toBeInstanceOf(ListenerVoteLimitError);

    const owner = await castVote({
      visitorId: 'owner',
      trackNumber: 1,
      versionSlug: 'v1',
      takeLabel: 'A',
      value: 1,
    });
    expect(owner.tallies[1]?.v1?.A).toBe(1);
    expect(owner.listenerTallies?.[1]?.v1?.A).toBe(20);
  });
});
