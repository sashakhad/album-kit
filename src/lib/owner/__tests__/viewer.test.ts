// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = {
  id: string;
  tokenHash: string;
  expiresAt: Date;
  redeemedAt: Date | null;
  revokedAt: Date | null;
};
const state = vi.hoisted(() => ({ rows: new Map<string, Row>() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({
  albumKey: () => 'owner-secret',
  safeEqual: (a: string, b: string) => a === b,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    accessInvite: {
      create: async ({ data }: { data: Pick<Row, 'tokenHash' | 'expiresAt'> }) => {
        const row: Row = { id: 'invite-1', ...data, redeemedAt: null, revokedAt: null };
        state.rows.set(data.tokenHash, row);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { tokenHash: string; expiresAt: { gt: Date } };
        data: { redeemedAt: Date };
      }) => {
        const row = state.rows.get(where.tokenHash);
        if (
          row === undefined ||
          row.redeemedAt !== null ||
          row.revokedAt !== null ||
          row.expiresAt <= where.expiresAt.gt
        )
          return { count: 0 };
        row.redeemedAt = data.redeemedAt;
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { id?: string; tokenHash?: string } }) =>
        Array.from(state.rows.values()).find(
          row => row.id === where.id || row.tokenHash === where.tokenHash
        ) ?? null,
    },
  },
}));

import { createInvite, isViewerRequest, redeemInvite, viewerCookieValue } from '../viewer';

beforeEach(() => state.rows.clear());

describe('private listening invites', () => {
  it('redeems once and grants access from a second browser cookie until revoked', async () => {
    const invite = await createInvite();
    expect(await redeemInvite(invite.token)).toBe(invite.id);
    expect(await redeemInvite(invite.token)).toBeNull();
    const cookie = viewerCookieValue(invite.id);
    const request = new Request('http://localhost/listen', {
      headers: { cookie: `album_viewer=${cookie}` },
    });
    expect(await isViewerRequest(request)).toBe(true);
    state.rows.values().next().value!.revokedAt = new Date();
    expect(await isViewerRequest(request)).toBe(false);
  });
});
