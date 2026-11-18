// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const settingsState = vi.hoisted(() => ({
  reviewTakes: 'public' as 'public' | 'private',
  sunoModel: 'auto',
  promptWriter: 'grok-bot' as 'grok-bot' | 'cursor',
  comparison: 'off' as 'off' | 'originals-plus-combined' | 'curated',
  writerLineup: [] as string[],
  promptVariations: 2,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({ requireOwner: () => null }));
vi.mock('@/lib/settings/store', () => ({
  loadSettings: async () => ({
    ...(await import('@/lib/settings/schema')).DEFAULT_SETTINGS,
    preset: 'small-test',
    promptVariations: settingsState.promptVariations,
    sunoModel: settingsState.sunoModel,
    reviewTakes: settingsState.reviewTakes,
    promptWriter: settingsState.promptWriter,
    comparison: settingsState.comparison,
    writerLineup: settingsState.writerLineup,
  }),
}));
vi.mock('@/lib/album/album-config', () => ({
  loadAlbumConfig: async () => ({ tracks: [{ number: 1, title: 'Plant Bass’d' }] }),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    generationRound: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'round-1', ...data }),
    },
  },
}));

import { POST } from '@/app/api/owner/rounds/route';

function request(overrides: Record<string, unknown> = {}) {
  const body = {
    tracks: 1,
    prompts: [1, 2].map(lane => ({
      id: `p${lane}`,
      trackNumber: 1,
      lane,
      style:
        lane === 1
          ? 'Four on the floor, crisp hats and a warm bass groove.'
          : 'Syncopated drums, bright synth chords and a rising bridge.',
      writerHost: 'grok-bot',
      revision: 1,
    })),
    capabilities: {
      availableModels: ['v6'],
      qualityDefault: 'v6',
      costModel: 'v6',
      creditsPerGeneration: 10,
      outputsPerGeneration: 2,
      downloadsPerOutput: 1,
      generationCreditsAvailable: 100,
      downloadsAvailable: 20,
      checkedAt: new Date().toISOString(),
    },
    hostingChargeEstimateUsd: 0,
    hostingEligibilityVerified: true,
    ...overrides,
  };
  return new Request('http://localhost/api/owner/rounds', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  settingsState.reviewTakes = 'public';
  settingsState.sunoModel = 'auto';
  settingsState.promptWriter = 'grok-bot';
  settingsState.comparison = 'off';
  settingsState.writerLineup = [];
  settingsState.promptVariations = 2;
});

describe('round creation', () => {
  it('records a Lite round’s checked model and respects an explicit override or saved model', async () => {
    const capabilities = {
      availableModels: ['v6', 'v6-mini'],
      qualityDefault: 'v6',
      costModel: 'v6-mini',
      creditsPerGeneration: 10,
      outputsPerGeneration: 2,
      downloadsPerOutput: 0,
      generationCreditsAvailable: 100,
      downloadsAvailable: 0,
      checkedAt: new Date().toISOString(),
    };
    const plan = async (changes: Record<string, unknown> = {}) =>
      (await POST(request({ setupPath: 'light', capabilities, ...changes }))).json();
    const light = await plan();
    expect(light.round.status).toBe('preparing');
    expect(light.round.snapshot).toMatchObject({
      setupPath: 'light',
      resolvedSunoModel: 'v6-mini',
    });
    const lite = await plan({ setupPath: 'lite' });
    expect(lite.round.snapshot).toMatchObject({ setupPath: 'light', resolvedSunoModel: 'v6-mini' });
    const quality = { ...capabilities, costModel: 'v6' };
    const full = await plan({ setupPath: 'full', capabilities: quality });
    expect(full.round.snapshot.resolvedSunoModel).toBe('v6');
    const override = await plan({ sunoModelOverride: 'v6', capabilities: quality });
    expect(override.round.snapshot.resolvedSunoModel).toBe('v6');
    settingsState.sunoModel = 'v6';
    const pinned = await plan({ capabilities: quality });
    expect(pinned.round.snapshot.resolvedSunoModel).toBe('v6');
  });

  it('saves exactly two Small test prompt slots and the full route estimate', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.estimate).toMatchObject({
      prompts: 2,
      generations: 2,
      expectedOutputs: 4,
      generationCredits: 20,
      downloadsPerTake: 0,
      downloads: 0,
    });
    expect(result.round.snapshot.prompts).toHaveLength(2);
    expect(result.round.snapshot.prompts[0]).toMatchObject({
      writerHost: 'grok-bot',
      observedModel: null,
      attribution: 'undisclosed',
    });
  });

  it('requires fresh connected-account facts before a paid round', async () => {
    const stale = request({
      capabilities: {
        availableModels: ['v6'],
        qualityDefault: 'v6',
        costModel: 'v6',
        creditsPerGeneration: 10,
        outputsPerGeneration: 2,
        downloadsPerOutput: 1,
        generationCreditsAvailable: 100,
        downloadsAvailable: 20,
        checkedAt: '2020-01-01T00:00:00.000Z',
      },
    });
    expect((await POST(stale)).status).toBe(409);
  });

  it('snapshots a one-round Suno override without changing album defaults', async () => {
    const response = await POST(
      request({
        sunoModelOverride: 'v6-mini',
        capabilities: {
          availableModels: ['v6', 'v6-mini'],
          qualityDefault: 'v6',
          costModel: 'v6-mini',
          creditsPerGeneration: 5,
          outputsPerGeneration: 2,
          downloadsPerOutput: 1,
          generationCreditsAvailable: 100,
          downloadsAvailable: 20,
          checkedAt: new Date().toISOString(),
        },
      })
    );
    const result = await response.json();
    expect(result.round.snapshot.settings.sunoModel).toBe('v6-mini');
    expect(result.round.snapshot.settings).not.toHaveProperty('vocals');
    expect(result.round.snapshot.resolvedSunoModel).toBe('v6-mini');
    expect(result.estimate.generationCredits).toBe(10);
    expect((await POST(request({ sunoModelOverride: 'retired-model' }))).status).toBe(409);
  });

  it('blocks a retired saved model instead of silently authorizing an available replacement', async () => {
    settingsState.sunoModel = 'v5.5';
    try {
      const blocked = await POST(request());
      const result = await blocked.json();
      expect(result.round.status).toBe('blocked');
      expect(result.estimate.migration).toContain('v5.5 is unavailable');
      expect(result.estimate.blockers).toContain(
        'Saved Suno model v5.5 is unavailable. Choose an available model in Album Settings or request a one-round override.'
      );

      const overridden = await POST(request({ sunoModelOverride: 'v6' }));
      const overrideResult = await overridden.json();
      expect(overrideResult.round.status).toBe('preparing');
      expect(overrideResult.round.snapshot.settings.sunoModel).toBe('v6');
      expect(overrideResult.estimate.blockers).toEqual([]);
    } finally {
      settingsState.sunoModel = 'auto';
    }
  });

  it('shows download credits per take when review takes stay private', async () => {
    settingsState.reviewTakes = 'private';
    const response = await POST(request());
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.estimate).toMatchObject({
      expectedOutputs: 4,
      downloadsPerTake: 1,
      downloads: 4,
    });
    expect(result.round.snapshot.settings.reviewTakes).toBe('private');
  });

  it('accepts a Cursor round after the selected models return prompts', async () => {
    settingsState.promptWriter = 'cursor';
    settingsState.comparison = 'originals-plus-combined';
    settingsState.writerLineup = ['Opus', 'Sonnet'];
    const styles = [
      'Warm upright bass, brushed snare and a slow soul vocal line.',
      'Muted guitar stabs, soft organ and a late-night groove.',
      'Bass and organ together, with the brushed snare from the soul lane.',
    ];
    const response = await POST(
      request({
        externalSpendEstimateUsd: 0,
        prompts: [
          {
            id: 'p1',
            trackNumber: 1,
            lane: 1,
            style: styles[0],
            writerHost: 'cursor',
            writerProvider: 'Anthropic',
            requestedModel: 'Opus',
            observedModel: 'Opus',
            executionId: 'run-opus',
            revision: 1,
            role: 'original',
            lyrics: '[Instrumental]',
            brief: 'Slow soul',
          },
          {
            id: 'p2',
            trackNumber: 1,
            lane: 2,
            style: styles[1],
            writerHost: 'cursor',
            writerProvider: 'Anthropic',
            requestedModel: 'Sonnet',
            observedModel: 'Sonnet',
            executionId: 'run-sonnet',
            revision: 1,
            role: 'original',
            lyrics: '[Instrumental]',
            brief: 'Slow soul',
          },
          {
            id: 'p3',
            trackNumber: 1,
            lane: 3,
            style: styles[2],
            writerHost: 'grok-bot',
            revision: 1,
            role: 'combined',
            contributors: ['Opus', 'Sonnet'],
            lyrics: '[Instrumental]',
            brief: 'Slow soul',
          },
        ],
      })
    );
    const result = await response.json();
    expect(response.status).toBe(201);
    expect(result.round.status).toBe('preparing');
    expect(result.estimate).toMatchObject({
      prompts: 3,
      expectedOutputs: 6,
      balanceKnown: true,
      blockers: [],
    });
    expect(result.round.snapshot.prompts[2]).toMatchObject({
      role: 'combined',
      contributors: ['Opus', 'Sonnet'],
    });
  });

  it('does not credit a Cursor name that never ran', async () => {
    settingsState.promptWriter = 'cursor';
    settingsState.comparison = 'originals-plus-combined';
    settingsState.writerLineup = ['Opus'];
    const response = await POST(
      request({
        externalSpendEstimateUsd: 0,
        prompts: [
          {
            id: 'p1',
            trackNumber: 1,
            lane: 1,
            style: 'Warm upright bass, brushed snare and a slow soul vocal line.',
            writerHost: 'cursor',
            requestedModel: 'Opus',
            revision: 1,
            role: 'original',
          },
          {
            id: 'p2',
            trackNumber: 1,
            lane: 2,
            style: 'Muted guitar stabs, soft organ and a late-night groove.',
            writerHost: 'grok-bot',
            revision: 1,
            role: 'combined',
            contributors: ['Opus'],
          },
        ],
      })
    );
    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result.error.join(' ')).toContain('has not run');
  });

  it('lets a hidden Suno balance through when the batch is inside the spending limit', async () => {
    const response = await POST(
      request({
        capabilities: {
          availableModels: ['v6-mini'],
          qualityDefault: 'v6-mini',
          costModel: 'v6-mini',
          creditsPerGeneration: 10,
          outputsPerGeneration: 2,
          downloadsPerOutput: 0,
          generationCreditsAvailable: null,
          downloadsAvailable: 0,
          checkedAt: new Date().toISOString(),
        },
      })
    );
    const result = await response.json();
    expect(response.status).toBe(201);
    expect(result.estimate.balanceKnown).toBe(false);
    expect(result.estimate.blockers).toEqual([]);
    expect(result.round.status).toBe('preparing');
  });
});
