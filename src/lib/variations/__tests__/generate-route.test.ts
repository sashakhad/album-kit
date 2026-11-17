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
  webhookConfigured: true,
  blind: false,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({
  OWNER_VISITOR_ID: 'owner',
  requireOwner: () => null,
  isWriteRequest: () => false,
}));
vi.mock('@/lib/votes/board', () => ({ getVoteSnapshot: async () => ({ currentRound: 1 }) }));
vi.mock('@/lib/votes/exposure', () => ({ isBlindForSnapshot: async () => state.blind }));
vi.mock('@/lib/variations/service', () => ({
  loadVariationQuote: async () => ({
    settings: state.settings,
    context: {
      requestId: id,
      trackNumber: 1,
      trackTitle: 'Track One',
      parentTakeFilename: 'v1-01-track-one-p1-takea.mp3',
      parentStyle: 'warm bass and a steady hook',
      requestedTakes: 2,
      instructions: '',
      sunoModelPolicy: 'auto',
      promptWriter: 'grok-bot',
      promptWriterModel: 'auto',
      reviewTakes: 'public',
    },
    liveAccountChecked: true,
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
  variationWebhookConfigured: () => state.webhookConfigured,
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
import { POST as callback } from '@/app/api/owner/variations/callback/route';
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
  state.webhookConfigured = true;
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
    expect(state.row.workerPayload).toMatchObject({
      operationId: id,
      parentStyle: 'warm bass and a steady hook',
      allowanceReserved: 10,
      dispatch: 'webhook-accepted',
    });
  });

  it('stores the worker payload and stays generating when no webhook is configured', async () => {
    state.webhookConfigured = false;
    const response = await POST(request());
    expect(response.status).toBe(202);
    const body: unknown = await response.json();
    expect(body).toEqual({ status: 'generating', requestId: id });
    expect(JSON.stringify(body)).not.toMatch(/webhook/i);
    expect(state.webhook).not.toHaveBeenCalled();
    expect(state.row).toMatchObject({
      status: 'generating',
      creditsReserved: 10,
      dispatchError: null,
      claimToken: null,
      claimExpiresAt: null,
    });
    expect(state.row.workerPayload).toMatchObject({
      kind: 'generate',
      operationId: id,
      parentStyle: 'warm bass and a steady hook',
      allowanceReserved: 10,
      creditsReserved: 10,
      callbackPath: '/api/owner/variations/callback',
      liveAccountChecked: false,
      dispatch: 'pull',
    });
    expect((await POST(request())).status).toBe(200);
    expect(state.webhook).not.toHaveBeenCalled();
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
    expect((await POST(request())).status).toBe(202);
    expect(state.row).toMatchObject({
      status: 'generating',
      creditsReserved: 10,
      dispatchError: 'Connection lost',
    });
    expect((await POST(request())).status).toBe(200);
    expect(state.webhook).toHaveBeenCalledTimes(1);

    state.row.status = 'requested';
    state.row.creditsReserved = 0;
    state.webhook.mockRejectedValueOnce(new VariationWebhookError('No job started', true));
    expect((await POST(request())).status).toBe(502);
    expect(state.row).toMatchObject({ status: 'failed', creditsReserved: 0 });
  });
  it('reconciles a late no-charge callback after uncertain dispatch without dispatching twice', async () => {
    state.webhook.mockRejectedValueOnce(new Error('Connection lost'));
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ status: 'generating', dispatchUncertain: true });
    expect((await POST(request())).status).toBe(200);
    expect(state.webhook).toHaveBeenCalledTimes(1);
    const oldSecret = process.env.ALBUM_VARIATION_WEBHOOK_SECRET;
    process.env.ALBUM_VARIATION_WEBHOOK_SECRET = 'test-secret';
    try {
      const result = await callback(
        new Request('http://localhost/api/owner/variations/callback', {
          method: 'POST',
          headers: { Authorization: 'Bearer test-secret' },
          body: JSON.stringify({
            requestId: id,
            operationId: id,
            status: 'failed',
            reason: 'No job started',
            chargeApplied: false,
          }),
        })
      );
      expect(result.status).toBe(200);
      expect(state.row).toMatchObject({
        status: 'failed',
        creditsReserved: 0,
        dispatchError: 'No job started',
      });
    } finally {
      if (oldSecret === undefined) delete process.env.ALBUM_VARIATION_WEBHOOK_SECRET;
      else process.env.ALBUM_VARIATION_WEBHOOK_SECRET = oldSecret;
    }
  });

  it('returns a fresh confirmation quote when another request consumes the allowance', async () => {
    state.reserved = 20;
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      quote: { remainingAllowance: 0, requiresConfirmation: true },
    });
    expect(state.webhook).not.toHaveBeenCalled();
    expect((await POST(request(true))).status).toBe(202);
  });
});
