// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const settingsState = vi.hoisted(() => ({
  reviewTakes: 'public' as 'public' | 'private',
  sunoModel: 'auto',
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({ requireOwner: () => null }));
vi.mock('@/lib/settings/store', () => ({
  loadSettings: async () => ({
    ...(await import('@/lib/settings/schema')).DEFAULT_SETTINGS,
    preset: 'small-test',
    promptVariations: 2,
    sunoModel: settingsState.sunoModel,
    reviewTakes: settingsState.reviewTakes,
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
});

describe('round creation', () => {
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
});
