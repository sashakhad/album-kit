import { describe, expect, it } from 'vitest';

import { estimateRound, promptAttribution, type SunoCapabilities } from '../preflight';
import { DEFAULT_SETTINGS, presetSettings } from '@/lib/settings/schema';

const capabilities: SunoCapabilities = {
  availableModels: ['v6', 'v6-wild', 'v6-mini'],
  qualityDefault: 'v6',
  costModel: 'v6',
  creditsPerGeneration: 10,
  outputsPerGeneration: 2,
  downloadsPerOutput: 1,
  generationCreditsAvailable: 100,
  downloadsAvailable: 20,
  checkedAt: '2026-11-09T20:00:00.000Z',
};

describe('round preflight', () => {
  it('keeps a Small test at two prompts, two generations and four outputs', () => {
    const settings = { ...DEFAULT_SETTINGS, ...presetSettings('small-test') };
    const estimate = estimateRound({
      tracks: 1,
      settings,
      capabilities,
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(estimate).toMatchObject({
      tracks: 1,
      prompts: 2,
      generations: 2,
      expectedOutputs: 4,
      generationCredits: 20,
      downloads: 4,
      sunoModel: 'v6',
      blockers: [],
    });
  });

  it('migrates a missing pinned model without asking for a version', () => {
    const estimate = estimateRound({
      tracks: 1,
      settings: { ...DEFAULT_SETTINGS, sunoModel: 'v5.5' },
      capabilities,
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(estimate.sunoModel).toBe('v6');
    expect(estimate.migration).toContain('v5.5 is unavailable');
  });

  it('catches download shortage before a large round', () => {
    const estimate = estimateRound({
      tracks: 10,
      settings: DEFAULT_SETTINGS,
      capabilities,
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(estimate).toMatchObject({
      prompts: 50,
      generations: 50,
      expectedOutputs: 100,
      generationCredits: 500,
      downloads: 100,
    });
    expect(estimate.blockers).toContain('Need 100 downloads; 20 available.');
  });

  it('never invents a Grok Bot model and separates requested from observed Cursor models', () => {
    expect(
      promptAttribution({ id: 'p1', host: 'grok-bot', observedModel: 'claimed-v9' })
    ).toMatchObject({ observedModel: null, attribution: 'undisclosed', writerProvider: null });
    expect(
      promptAttribution({
        id: 'p2',
        host: 'cursor',
        provider: 'Provider',
        requestedModel: 'Auto',
        observedModel: 'model-x',
        executionId: 'task-1',
      })
    ).toMatchObject({ requestedModel: 'Auto', observedModel: 'model-x', attribution: 'verified' });
    expect(
      promptAttribution({ id: 'p3', host: 'cursor', requestedModel: 'model-x' }).attribution
    ).toBe('unverified');
  });
});
