import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/lib/settings/schema';
import { estimateVariation, type WebhookQuote } from '../quote';

function provider(overrides: Partial<WebhookQuote['capabilities']> = {}): WebhookQuote {
  return {
    capabilities: {
      availableModels: ['v6'],
      qualityDefault: 'v6',
      costModel: 'v6',
      creditsPerGeneration: 10,
      outputsPerGeneration: 2,
      downloadsPerOutput: 1,
      generationCreditsAvailable: 50,
      downloadsAvailable: 10,
      checkedAt: new Date().toISOString(),
      ...overrides,
    },
    writerReady: true,
    hostingEligibilityVerified: true,
    externalSpendEstimateUsd: 0,
    hostingChargeEstimateUsd: 0,
  };
}

describe('site variation quote', () => {
  it('prices whole Suno batches and asks before exceeding the remaining allowance', () => {
    const quote = estimateVariation({
      requestedTakes: 3,
      settings: { ...DEFAULT_SETTINGS, variationCreditAllowance: 25, reviewTakes: 'private' },
      creditsAlreadyReserved: 10,
      provider: provider(),
    });
    expect(quote).toMatchObject({
      model: 'v6',
      generations: 2,
      expectedOutputs: 4,
      generationCredits: 20,
      downloadCredits: 4,
      remainingAllowance: 15,
      requiresConfirmation: true,
      blockers: [],
    });
  });

  it('blocks uncertain model rates, ambiguous auto models and stale account facts', () => {
    const quote = estimateVariation({
      requestedTakes: 2,
      settings: DEFAULT_SETTINGS,
      creditsAlreadyReserved: 0,
      provider: provider({
        availableModels: ['v6', 'v6-mini'],
        qualityDefault: null,
        costModel: 'v6-mini',
        checkedAt: '2020-01-01T00:00:00.000Z',
      }),
    });
    expect(quote.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Refresh the Suno account'),
        expect.stringContaining('eligible quality default'),
        expect.stringContaining('credit rate'),
      ])
    );
  });

  it('prices a v6 create as two songs for 10 Suno credits inside the allowance', () => {
    const quote = estimateVariation({
      requestedTakes: 2,
      settings: { ...DEFAULT_SETTINGS, variationCreditAllowance: 50 },
      creditsAlreadyReserved: 0,
      provider: provider(),
    });
    expect(quote).toMatchObject({
      model: 'v6',
      generations: 1,
      expectedOutputs: 2,
      generationCredits: 10,
      remainingAllowance: 50,
      requiresConfirmation: false,
      blockers: [],
    });
  });

  it('blocks a fixture quote so a reference worker cannot start a paid run', () => {
    const quote = estimateVariation({
      requestedTakes: 2,
      settings: DEFAULT_SETTINGS,
      creditsAlreadyReserved: 0,
      provider: { ...provider(), fixture: true },
    });
    expect(quote.blockers).toEqual(expect.arrayContaining([expect.stringContaining('fixture')]));
    expect(quote.generationCredits).toBe(10);
  });

  it('asks for confirmation when there is a USD charge even within the credit allowance', () => {
    const quote = estimateVariation({
      requestedTakes: 2,
      settings: { ...DEFAULT_SETTINGS, variationCreditAllowance: 20 },
      creditsAlreadyReserved: 0,
      provider: { ...provider(), externalSpendEstimateUsd: 2 },
    });
    expect(quote.requiresConfirmation).toBe(true);
    expect(quote.blockers).toEqual([]);
  });
});
