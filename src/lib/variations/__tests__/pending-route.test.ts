// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const id = 'bdb30a82-2b40-4ebf-b5ce-3d8a99541ddf';
const otherId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const payload = {
  kind: 'generate',
  operationId: id,
  parentStyle: 'warm bass and a steady hook',
  allowanceReserved: 10,
  quote: { generationCredits: 10 },
};

type Row = {
  id: string;
  status: string;
  creditsReserved: number;
  roundId: string | null;
  claimToken: string | null;
  claimExpiresAt: Date | null;
  workerPayload: unknown;
  createdAt: Date;
};

const state = vi.hoisted(() => ({
  rows: [] as Row[],
}));

function matchesWhere(
  row: Row,
  where: { status?: string; OR?: Array<Record<string, unknown>>; claimToken?: string; id?: string }
): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.claimToken !== undefined && row.claimToken !== where.claimToken) return false;
  if (where.OR === undefined) return true;
  for (const clause of where.OR) {
    if (clause.claimExpiresAt === null && row.claimExpiresAt === null) return true;
    const expires = clause.claimExpiresAt;
    if (
      expires !== null &&
      typeof expires === 'object' &&
      'lte' in expires &&
      expires.lte instanceof Date &&
      row.claimExpiresAt !== null &&
      row.claimExpiresAt.getTime() <= expires.lte.getTime()
    ) {
      return true;
    }
  }
  return false;
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    variationRequest: {
      findMany: async ({
        where,
      }: {
        where: { status: string; OR: Array<Record<string, unknown>> };
      }) =>
        state.rows
          .filter(row => matchesWhere(row, where))
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.rows.find(row => row.id === where.id) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          status: string;
          claimToken?: string;
          OR?: Array<Record<string, unknown>>;
        };
        data: Partial<Row>;
      }) => {
        const row = state.rows.find(item => matchesWhere(item, where));
        if (row === undefined) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  },
}));

import { POST as claim } from '@/app/api/owner/variations/claim/route';
import { GET as pending } from '@/app/api/owner/variations/pending/route';

function bearer(token: string | null, body?: object): Request {
  return new Request('http://localhost/api/owner/variations/pending', {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.stubEnv('ALBUM_WRITE_TOKEN', 'write-token');
  const now = Date.now();
  state.rows = [
    {
      id,
      status: 'generating',
      creditsReserved: 10,
      roundId: null,
      claimToken: null,
      claimExpiresAt: null,
      workerPayload: payload,
      createdAt: new Date('2026-11-17T12:00:00.000Z'),
    },
    {
      id: otherId,
      status: 'generating',
      creditsReserved: 10,
      roundId: 'round-held',
      claimToken: 'held-token',
      claimExpiresAt: new Date(now + 60_000),
      workerPayload: { ...payload, operationId: otherId },
      createdAt: new Date('2026-11-17T11:00:00.000Z'),
    },
  ];
});

describe('pending variation workers', () => {
  it('rejects a caller without the write token', async () => {
    expect((await pending(bearer(null))).status).toBe(401);
    expect((await claim(bearer(null, { operationId: id }))).status).toBe(401);
    expect(state.rows[0]?.claimToken).toBeNull();
  });

  it('lists unclaimed work with the full payload and omits a live claim', async () => {
    const response = await pending(bearer('write-token'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { operations: Array<Record<string, unknown>> };
    expect(body.operations).toHaveLength(1);
    expect(body.operations[0]).toMatchObject({
      operationId: id,
      status: 'generating',
      creditsReserved: 10,
      roundId: null,
      payload,
    });
  });

  it('returns an expired claim to the pending list', async () => {
    state.rows[1]!.claimExpiresAt = new Date(Date.now() - 1_000);
    const response = await pending(bearer('write-token'));
    const body = (await response.json()) as { operations: Array<{ operationId: string }> };
    expect(body.operations.map(item => item.operationId).sort()).toEqual([id, otherId].sort());
  });

  it('claims once, repeats the same token, and lets a new worker take an expired lease', async () => {
    const first = await claim(bearer('write-token', { operationId: id }));
    expect(first.status).toBe(200);
    const claimed = (await first.json()) as {
      claimToken: string;
      payload: typeof payload;
      creditsReserved: number;
    };
    expect(claimed.payload).toMatchObject(payload);
    expect(claimed.creditsReserved).toBe(10);
    expect(state.rows[0]?.creditsReserved).toBe(10);

    const again = await claim(
      bearer('write-token', { operationId: id, claimToken: claimed.claimToken })
    );
    expect(again.status).toBe(200);
    expect((await again.json()) as { claimToken: string }).toMatchObject({
      claimToken: claimed.claimToken,
    });

    const rival = await claim(bearer('write-token', { operationId: id }));
    expect(rival.status).toBe(409);
    expect(state.rows[0]?.claimToken).toBe(claimed.claimToken);
    expect(state.rows[0]?.creditsReserved).toBe(10);

    state.rows[0]!.claimExpiresAt = new Date(Date.now() - 1_000);
    const takeover = await claim(bearer('write-token', { operationId: id }));
    expect(takeover.status).toBe(200);
    const next = (await takeover.json()) as { claimToken: string };
    expect(next.claimToken).not.toBe(claimed.claimToken);
    expect(state.rows[0]?.claimToken).toBe(next.claimToken);
  });
});
