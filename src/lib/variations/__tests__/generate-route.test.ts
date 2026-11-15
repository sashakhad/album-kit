// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '@/lib/settings/schema';

const id = 'bdb30a82-2b40-4ebf-b5ce-3d8a99541ddf';
const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  settings: {} as Record<string, unknown>,
  reserved: 0,
  otherUsd: 0,
  webhook: vi.fn(),
  blind: false,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({ OWNER_VISITOR_ID: 'owner', requireOwner: () => null }));
vi.mock('@/lib/votes/board', () => ({ getVoteSnapshot: async () => ({ currentRound: 1 }) }));
vi.mock('@/lib/votes/exposure', () => ({ isBlindForSnapshot: async () => state.blind }));
vi.mock('@/lib/variations/service', () => ({
  loadVariationQuote: async () => ({
    settings: state.settings,
    context: { requestId: id },
    quote: {
      quoteKey: 'a'.repeat(64),
      generationCredits: 10,
      model: 'v6',
      expectedOutputs: 2,
      downloadCredits: 0,
      externalSpendEstimateUsd: state.otherUsd,
      hostingChargeEstimateUsd: 0,
      blockers: [],
    },
  }),
}));
vi.mock('@/lib/variations/webhook', () => ({
  callVariationWebhook: state.webhook,
  VariationWebhookError: class VariationWebhookError extends Error {
    constructor(
      message: string,
      public readonly definitelyNotCharged = false
    ) {
      super(message);
    }
  },
}));
vi.mock('@/lib/prisma', () => {
  const db = {
    variationRequest: {
      findUnique: async () => state.row,
      aggregate: async () => ({ _sum: { creditsReserved: state.reserved } }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { status: string; roundId?: null };
        data: Record<string, unknown>;
      }) => {
        if (
          state.row.status !== where.status ||
          (where.roundId === null && state.row.roundId !== null)
        )
          return { count: 0 };
        Object.assign(state.row, data);
        return { count: 1 };
      },
    },
    albumSettings: {
      findUnique: async () => ({ defaults: state.settings, overrides: {} }),
    },
  };
  return { prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } };
});

import { POST } from '@/app/api/owner/variations/generate/route';
import { VariationWebhookError } from '@/lib/variations/webhook';

function request(confirmExtraCost = false) {
  return new Request('http://localhost/api/owner/variations/generate', {
    method: 'POST',
    body: JSON.stringify({ id, quoteKey: 'a'.repeat(64), confirmExtraCost }),
  });
}

beforeEach(() => {
  state.row = {
    id,
    status: 'requested',
    roundId: null,
    trackNumber: 1,
    parentTakeFilename: 'v1-01-track-one-p1-takea.mp3',
    requestedTakes: 2,
    instructions: '',
  };
  state.settings = { ...DEFAULT_SETTINGS, variationCreditAllowance: 20 };
  state.reserved = 0;
  state.otherUsd = 0;
  state.blind = false;
  state.webhook.mockReset().mockResolvedValue({ operationId: id, status: 'accepted' });
});

describe('site generation dispatch', () => {
  it('reserves the exact credits, dispatches once and treats a retry idempotently', async () => {
    expect((await POST(request())).status).toBe(202);
    expect(state.row).toMatchObject({
      status: 'generating',
      creditsReserved: 10,
      quotedModel: 'v6',
    });
    expect(state.webhook).toHaveBeenCalledWith(
      'generate',
      expect.objectContaining({ operationId: id })
    );
    expect((await POST(request())).status).toBe(200);
    expect(state.webhook).toHaveBeenCalledTimes(1);
  });

  it('requires in-form confirmation when the saved balance is insufficient', async () => {
    state.settings.variationCreditAllowance = 0;
    expect((await POST(request())).status).toBe(409);
    expect(state.row.status).toBe('requested');
    expect(state.webhook).not.toHaveBeenCalled();
    expect((await POST(request(true))).status).toBe(202);
  });

  it('requires confirmation for other estimated charges within the credit allowance', async () => {
    state.otherUsd = 5;
    expect((await POST(request())).status).toBe(409);
    expect(state.webhook).not.toHaveBeenCalled();
    expect((await POST(request(true))).status).toBe(202);
  });

  it('blocks generation while the vote pass is blind', async () => {
    state.blind = true;
    expect((await POST(request())).status).toBe(409);
    expect(state.webhook).not.toHaveBeenCalled();
  });

  it('keeps ambiguous charges reserved but releases a verified no-charge failure', async () => {
    state.webhook.mockRejectedValueOnce(new Error('Connection lost'));
    expect((await POST(request())).status).toBe(502);
    expect(state.row).toMatchObject({
      status: 'failed',
      creditsReserved: 10,
      dispatchError: 'Connection lost',
    });
    expect((await POST(request())).status).toBe(409);
    expect(state.webhook).toHaveBeenCalledTimes(1);

    state.row.status = 'requested';
    state.row.creditsReserved = 0;
    state.webhook.mockRejectedValueOnce(new VariationWebhookError('No job started', true));
    expect((await POST(request())).status).toBe(502);
    expect(state.row).toMatchObject({ status: 'failed', creditsReserved: 0 });
  });
});
