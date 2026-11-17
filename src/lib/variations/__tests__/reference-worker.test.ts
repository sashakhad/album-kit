// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/lib/settings/schema';
import { estimateVariation } from '@/lib/variations/quote';
import {
  fixtureQuote,
  handleVariationWebhook,
  variationWorkerResponse,
} from '../../../../scripts/variation-worker.mjs';

const operationId = 'bdb30a82-2b40-4ebf-b5ce-3d8a99541ddf';

describe('reference variation worker', () => {
  it('quotes a v6 fixture and refuses to spend on a repeated operation', async () => {
    const quote = fixtureQuote();
    expect(quote.fixture).toBe(true);
    expect(quote.capabilities).toMatchObject({
      costModel: 'v6',
      creditsPerGeneration: 10,
      outputsPerGeneration: 2,
    });
    const priced = estimateVariation({
      requestedTakes: 2,
      settings: DEFAULT_SETTINGS,
      creditsAlreadyReserved: 0,
      provider: quote,
    });
    expect(priced.generationCredits).toBe(10);
    expect(priced.expectedOutputs).toBe(2);
    expect(priced.blockers.join(' ')).toContain('fixture');

    const ledger = new Set<string>();
    const first = handleVariationWebhook({ kind: 'generate', operationId, quote: priced }, ledger);
    const second = handleVariationWebhook({ kind: 'generate', operationId }, ledger);
    expect(first).toMatchObject({ status: 202, body: { operationId, status: 'accepted' } });
    expect(second).toMatchObject({
      status: 200,
      body: { operationId, status: 'accepted', duplicate: true },
    });
    expect(ledger.size).toBe(1);

    const denied = await variationWorkerResponse(
      new Request('http://127.0.0.1/', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong' },
        body: JSON.stringify({ kind: 'quote' }),
      }),
      ledger,
      'local-secret'
    );
    expect(denied.status).toBe(401);
    const allowed = await variationWorkerResponse(
      new Request('http://127.0.0.1/', {
        method: 'POST',
        headers: { authorization: 'Bearer local-secret' },
        body: JSON.stringify({ kind: 'quote' }),
      }),
      ledger,
      'local-secret'
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ fixture: true });
  });
});
