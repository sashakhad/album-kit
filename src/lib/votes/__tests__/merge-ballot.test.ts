import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  countBrowserListenerVotes,
  listenerBallotIds,
  mergeBrowserListenerVotes,
  mergeListenerBallots,
} from '@/lib/votes/merge-ballot';

type VoteRow = {
  id: string;
  visitorId: string;
  trackNumber: number;
  versionSlug: string;
  takeLabel: string;
  value: number;
  round: number;
  detailsExposed: boolean;
};

const state = vi.hoisted(() => {
  const rows: VoteRow[] = [];

  function matches(row: VoteRow, visitorId?: string | { in: string[] }): boolean {
    if (visitorId === undefined) {
      return true;
    }
    if (typeof visitorId === 'string') {
      return row.visitorId === visitorId;
    }
    return visitorId.in.includes(row.visitorId);
  }

  const voteApi = {
    findMany: async (args?: { where?: { visitorId?: string | { in: string[] } } }) =>
      rows.filter(row => matches(row, args?.where?.visitorId)).map(row => ({ ...row })),
    deleteMany: async (args: { where: { visitorId: { in: string[] } } }) => {
      const remove = new Set(args.where.visitorId.in);
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index];
        if (row !== undefined && remove.has(row.visitorId)) {
          rows.splice(index, 1);
        }
      }
    },
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
      create: Omit<VoteRow, 'id'>;
      update: { value: { increment: number }; detailsExposed?: boolean };
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
        rows.push({ id: `vote-${rows.length + 1}`, ...args.create });
        return;
      }
      existing.value += args.update.value.increment;
      if (args.update.detailsExposed === true) {
        existing.detailsExposed = true;
      }
    },
  };

  return {
    rows,
    listenerId: null as string | null,
    inviteId: null as string | null,
    voteApi,
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/votes/listener-id', () => ({
  listenerIdFromRequest: () => state.listenerId,
  listenerIdFromPage: async () => state.listenerId,
  publicListenerVisitorId: (id: string) => `listener:${id}`,
  inviteListenerVisitorId: (id: string) => `listener:invite:${id}`,
}));
vi.mock('@/lib/owner/viewer', () => ({
  viewerInviteIdFromRequest: async () => state.inviteId,
  viewerInviteId: async () => state.inviteId,
}));
vi.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    vote: state.voteApi,
    $transaction: async (fn: (tx: { vote: typeof state.voteApi }) => Promise<number>) =>
      fn({ vote: state.voteApi }),
  }),
}));

function row(partial: Omit<VoteRow, 'id' | 'detailsExposed'> & { detailsExposed?: boolean }): void {
  state.rows.push({
    id: `vote-${state.rows.length + 1}`,
    detailsExposed: false,
    ...partial,
  });
}

beforeEach(() => {
  state.rows.length = 0;
  state.listenerId = null;
  state.inviteId = null;
});

describe('listener ballot ids', () => {
  it('names the public cookie and the private invite as separate ballots', () => {
    expect(listenerBallotIds({ listenerId: 'abc', inviteId: 'invite-1' })).toEqual([
      'listener:abc',
      'listener:invite:invite-1',
    ]);
    expect(listenerBallotIds({ listenerId: null, inviteId: null })).toEqual([]);
    expect(listenerBallotIds({ listenerId: '', inviteId: '' })).toEqual([]);
  });
});

describe('mergeListenerBallots', () => {
  it('adds listener votes from this browser onto owner scores and clears those ballots', async () => {
    row({
      visitorId: 'listener:abc',
      trackNumber: 1,
      versionSlug: 'v1',
      takeLabel: 'A',
      value: 4,
      round: 2,
    });
    row({
      visitorId: 'listener:invite:invite-1',
      trackNumber: 1,
      versionSlug: 'v1',
      takeLabel: 'A',
      value: -1,
      round: 2,
    });
    row({
      visitorId: 'owner',
      trackNumber: 1,
      versionSlug: 'v1',
      takeLabel: 'A',
      value: 2,
      round: 2,
    });
    row({
      visitorId: 'listener:someone-else',
      trackNumber: 1,
      versionSlug: 'v1',
      takeLabel: 'B',
      value: 9,
      round: 2,
    });

    const merged = await mergeListenerBallots([
      'listener:abc',
      'listener:invite:invite-1',
      'owner',
    ]);

    expect(merged).toBe(2);
    expect(
      state.rows.find(vote => vote.visitorId === 'owner' && vote.takeLabel === 'A')?.value
    ).toBe(5);
    expect(state.rows.some(vote => vote.visitorId === 'listener:abc')).toBe(false);
    expect(state.rows.some(vote => vote.visitorId === 'listener:invite:invite-1')).toBe(false);
    expect(state.rows.find(vote => vote.visitorId === 'listener:someone-else')?.value).toBe(9);
  });

  it('refuses ids that are not listener ballots', async () => {
    row({
      visitorId: 'owner',
      trackNumber: 1,
      versionSlug: 'v1',
      takeLabel: 'A',
      value: 3,
      round: 1,
    });

    expect(await mergeListenerBallots(['owner', 'guest'])).toBe(0);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]?.value).toBe(3);
  });
});

describe('browser listener ballot', () => {
  it('counts and merges only the ballots stored on this browser', async () => {
    state.listenerId = 'abc';
    state.inviteId = 'invite-1';
    row({
      visitorId: 'listener:abc',
      trackNumber: 3,
      versionSlug: 'v1',
      takeLabel: 'C',
      value: 1,
      round: 1,
    });
    row({
      visitorId: 'listener:invite:invite-1',
      trackNumber: 3,
      versionSlug: 'v1',
      takeLabel: 'C',
      value: 2,
      round: 1,
    });
    row({
      visitorId: 'listener:someone-else',
      trackNumber: 3,
      versionSlug: 'v1',
      takeLabel: 'C',
      value: 8,
      round: 1,
    });
    row({
      visitorId: 'listener:abc',
      trackNumber: 3,
      versionSlug: 'v1',
      takeLabel: 'D',
      value: 0,
      round: 1,
    });

    const request = new Request('http://localhost/api/owner/merge-ballot');
    expect(await countBrowserListenerVotes(request)).toBe(2);

    expect(await mergeBrowserListenerVotes(request)).toBe(2);
    expect(state.rows.find(vote => vote.visitorId === 'owner')?.value).toBe(3);
    expect(state.rows.some(vote => vote.visitorId === 'listener:abc')).toBe(false);
    expect(state.rows.some(vote => vote.visitorId === 'listener:invite:invite-1')).toBe(false);
    expect(state.rows.find(vote => vote.visitorId === 'listener:someone-else')?.value).toBe(8);
  });
});
