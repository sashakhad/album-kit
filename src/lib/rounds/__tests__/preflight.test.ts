import { describe, expect, it } from 'vitest';

import { comparisonPreview } from '../lineup';
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
      downloadsPerTake: 0,
      downloads: 0,
      sunoModel: 'v6',
      blockers: [],
    });
  });

  it('charges about 20 generation credits per Small test track', () => {
    const settings = { ...DEFAULT_SETTINGS, ...presetSettings('small-test') };
    const estimate = estimateRound({
      tracks: 2,
      settings,
      capabilities,
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(estimate).toMatchObject({
      tracks: 2,
      prompts: 4,
      generations: 4,
      expectedOutputs: 8,
      generationCredits: 40,
      blockers: [],
    });
  });

  it('blocks a missing pinned model until the owner chooses a verified replacement', () => {
    const estimate = estimateRound({
      tracks: 1,
      settings: { ...DEFAULT_SETTINGS, sunoModel: 'v5.5' },
      capabilities,
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(estimate.sunoModel).toBe('v6');
    expect(estimate.migration).toContain('v5.5 is unavailable');
    expect(estimate.blockers).toContain(
      'Saved Suno model v5.5 is unavailable. Choose an available model in Album Settings or request a one-round override.'
    );
  });

  it('uses the sole account-reported model without assuming a paid tier', () => {
    const estimate = estimateRound({
      tracks: 1,
      settings: DEFAULT_SETTINGS,
      capabilities: {
        ...capabilities,
        availableModels: ['v6-mini'],
        qualityDefault: 'v6-mini',
        costModel: 'v6-mini',
      },
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(estimate.sunoModel).toBe('v6-mini');
    expect(estimate.blockers).toEqual([]);
  });

  it('does not assume a version is the quality default when Suno omits one', () => {
    const estimate = estimateRound({
      tracks: 1,
      settings: DEFAULT_SETTINGS,
      capabilities: { ...capabilities, availableModels: ['v6-mini', 'v6'], qualityDefault: null },
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(estimate.sunoModel).toBe('v6-mini');
    expect(estimate.blockers).toContain(
      'Suno did not identify an eligible quality default; choose a verified model.'
    );
  });

  it('does not count review downloads, even when the account is short on them', () => {
    const estimate = estimateRound({
      tracks: 10,
      settings: DEFAULT_SETTINGS,
      capabilities: { ...capabilities, downloadsAvailable: 0 },
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(estimate).toMatchObject({
      prompts: 50,
      generations: 50,
      expectedOutputs: 100,
      generationCredits: 500,
      downloadsPerTake: 0,
      downloads: 0,
    });
    expect(estimate.blockers).toContain('Need 500 generation credits; 100 available.');
    expect(estimate.blockers.some(blocker => blocker.includes('download'))).toBe(false);
  });

  it('lets a review round through when the download limit is zero', () => {
    const settings = { ...DEFAULT_SETTINGS, ...presetSettings('small-test'), downloadLimit: 0 };
    const estimate = estimateRound({
      tracks: 1,
      settings,
      capabilities: { ...capabilities, downloadsAvailable: 0 },
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(estimate.downloadsPerTake).toBe(0);
    expect(estimate.downloads).toBe(0);
    expect(estimate.blockers).toEqual([]);
  });

  it('shows download credits per take when review takes stay private', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      ...presetSettings('small-test'),
      reviewTakes: 'private' as const,
    };
    const estimate = estimateRound({
      tracks: 1,
      settings,
      capabilities,
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(estimate).toMatchObject({
      expectedOutputs: 4,
      downloadsPerTake: 1,
      downloads: 4,
      blockers: [],
    });
  });

  it('blocks a private review round that is short on download credits', () => {
    const estimate = estimateRound({
      tracks: 1,
      settings: { ...DEFAULT_SETTINGS, reviewTakes: 'private', downloadLimit: 2 },
      capabilities: { ...capabilities, downloadsAvailable: 3 },
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(estimate.downloadsPerTake).toBe(1);
    expect(estimate.downloads).toBe(10);
    expect(estimate.blockers).toContain('Need 10 download credits (1 per take); 3 available.');
    expect(estimate.blockers).toContain('Download estimate exceeds the 2-download limit.');
  });

  it('asks for a verified per-take rate before a private round with no download charge', () => {
    const estimate = estimateRound({
      tracks: 1,
      settings: { ...DEFAULT_SETTINGS, reviewTakes: 'private' },
      capabilities: { ...capabilities, downloadsPerOutput: 0, downloadsAvailable: 0 },
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(estimate.downloadsPerTake).toBe(0);
    expect(estimate.downloads).toBe(0);
    expect(estimate.blockers).toContain(
      'Download credits per take must be checked before a private review round.'
    );
    expect(estimate.blockers.some(blocker => blocker.startsWith('Need '))).toBe(false);
  });

  it('does not block a hidden Suno balance, and still honors the spending limit', () => {
    const hidden = estimateRound({
      tracks: 1,
      settings: { ...DEFAULT_SETTINGS, ...presetSettings('small-test') },
      capabilities: { ...capabilities, generationCreditsAvailable: null },
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(hidden.balanceKnown).toBe(false);
    expect(hidden.blockers).toEqual([]);

    const overLimit = estimateRound({
      tracks: 1,
      settings: {
        ...DEFAULT_SETTINGS,
        ...presetSettings('small-test'),
        generationCreditLimit: 10,
      },
      capabilities: { ...capabilities, generationCreditsAvailable: null },
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    });
    expect(overLimit.blockers).toContain('Generation estimate exceeds the 10-credit limit.');
  });

  it('refuses Cursor until the selected models have returned prompts', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      ...presetSettings('studio'),
      comparison: 'originals-plus-combined' as const,
      writerLineup: ['Opus', 'Soul', 'Grok', 'Sonnet', 'Fable'],
    };
    const refused = estimateRound({
      tracks: 1,
      settings,
      capabilities,
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
      externalSpendEstimateUsd: 0,
    });
    expect(refused.prompts).toBe(6);
    expect(refused.expectedOutputs).toBe(12);
    expect(refused.blockers).toContain(
      'Cursor prompt execution is not connected to this kit. Complete a verified Cursor handoff or use Grok Bot.'
    );

    const returned = ['Opus', 'Soul', 'Grok', 'Sonnet', 'Fable'].map(model => ({
      writerHost: 'cursor' as const,
      writerProvider: 'Cursor',
      observedModel: model,
      executionId: `run-${model}`,
    }));
    const accepted = estimateRound({
      tracks: 1,
      settings,
      capabilities,
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
      externalSpendEstimateUsd: 0,
      returnedPrompts: [
        ...returned,
        { writerHost: 'grok-bot' as const, observedModel: null, executionId: null },
      ],
    });
    expect(accepted.blockers).toEqual([]);
    expect(comparisonPreview({ writers: 2, outputsPerGeneration: 2 })).toEqual({
      prompts: 3,
      takes: 6,
    });
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
