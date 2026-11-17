import { describe, expect, it } from 'vitest';

import { CLAIM_LEASE_MS, decideClaim, isAwaitingWorker } from '@/lib/variations/pull';

const id = 'bdb30a82-2b40-4ebf-b5ce-3d8a99541ddf';
const now = new Date('2026-11-17T12:00:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: 'generating',
    claimToken: null as string | null,
    claimExpiresAt: null as Date | null,
    ...overrides,
  };
}

describe('worker claim lease', () => {
  it('lists an unclaimed or expired operation and hides a live claim', () => {
    expect(isAwaitingWorker(row(), now)).toBe(true);
    expect(isAwaitingWorker(row({ claimExpiresAt: new Date(now.getTime()) }), now)).toBe(true);
    expect(isAwaitingWorker(row({ claimExpiresAt: new Date(now.getTime() + 1) }), now)).toBe(false);
    expect(isAwaitingWorker(row({ status: 'ready' }), now)).toBe(false);
  });

  it('refreshes the same claim token and rejects a second worker until the lease expires', () => {
    const first = decideClaim({
      row: row(),
      operationId: id,
      claimToken: undefined,
      now,
      nextToken: '11111111-1111-4111-8111-111111111111',
      leaseMs: CLAIM_LEASE_MS,
    });
    expect(first).toMatchObject({ type: 'grant', refresh: false });
    if (first.type !== 'grant') return;
    const held = decideClaim({
      row: row({ claimToken: first.claimToken, claimExpiresAt: first.claimExpiresAt }),
      operationId: id,
      claimToken: undefined,
      now: new Date(now.getTime() + 1_000),
      nextToken: '22222222-2222-4222-8222-222222222222',
      leaseMs: CLAIM_LEASE_MS,
    });
    expect(held.type).toBe('held');
    const refresh = decideClaim({
      row: row({ claimToken: first.claimToken, claimExpiresAt: first.claimExpiresAt }),
      operationId: id,
      claimToken: first.claimToken,
      now: new Date(now.getTime() + 1_000),
      nextToken: '33333333-3333-4333-8333-333333333333',
      leaseMs: CLAIM_LEASE_MS,
    });
    expect(refresh).toMatchObject({ type: 'grant', refresh: true, claimToken: first.claimToken });
    const expired = decideClaim({
      row: row({ claimToken: first.claimToken, claimExpiresAt: now }),
      operationId: id,
      claimToken: undefined,
      now,
      nextToken: '44444444-4444-4444-8444-444444444444',
      leaseMs: CLAIM_LEASE_MS,
    });
    expect(expired).toMatchObject({
      type: 'grant',
      refresh: false,
      claimToken: '44444444-4444-4444-8444-444444444444',
    });
  });
});
