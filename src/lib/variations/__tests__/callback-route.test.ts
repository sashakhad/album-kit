// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const id = 'bdb30a82-2b40-4ebf-b5ce-3d8a99541ddf';
const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  round: {} as Record<string, unknown>,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    variationRequest: {
      findUnique: async () => state.row,
      updateMany: async ({
        where,
        data,
      }: {
        where: { status: string; roundId?: string };
        data: Record<string, unknown>;
      }) => {
        if (
          state.row.status !== where.status ||
          (where.roundId && state.row.roundId !== where.roundId)
        )
          return { count: 0 };
        Object.assign(state.row, data);
        return { count: 1 };
      },
    },
    generationRound: { findUnique: async () => state.round },
  },
}));

import { POST } from '@/app/api/owner/variations/callback/route';

function request(body: object, authorized = true) {
  return new Request('http://localhost/api/owner/variations/callback', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authorized ? 'test-secret' : 'wrong-secret'}` },
    body: JSON.stringify({ requestId: id, operationId: id, ...body }),
  });
}

beforeEach(() => {
  process.env.ALBUM_VARIATION_WEBHOOK_SECRET = 'test-secret';
  state.row = { id, status: 'generating', roundId: 'round-1', creditsReserved: 10 };
  state.round = { id: 'round-1', status: 'preparing', snapshot: { variation: { requestId: id } } };
});
afterEach(() => {
  delete process.env.ALBUM_VARIATION_WEBHOOK_SECRET;
});

describe('variation worker callback', () => {
  it('requires the webhook secret and a ready round before marking takes ready', async () => {
    expect((await POST(request({ status: 'ready', roundId: 'round-1' }, false))).status).toBe(401);
    expect((await POST(request({ status: 'ready', roundId: 'round-1' }))).status).toBe(409);
    expect(state.row.status).toBe('generating');
    state.round.status = 'ready-to-listen';
    expect((await POST(request({ status: 'ready', roundId: 'round-1' }))).status).toBe(200);
    expect(state.row.status).toBe('ready');
  });

  it('records a failure reason and releases only known unspent credits', async () => {
    expect(
      (await POST(request({ status: 'failed', reason: 'Suno unavailable', chargeApplied: false })))
        .status
    ).toBe(200);
    expect(state.row).toMatchObject({
      status: 'failed',
      dispatchError: 'Suno unavailable',
      creditsReserved: 0,
    });
  });
});
