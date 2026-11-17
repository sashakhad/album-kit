// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '@/lib/settings/schema';

const state = vi.hoisted(() => ({
  configured: false,
  webhook: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/variations/parent', () => ({
  availableVariationParent: async () => ({
    filename: 'v1-01-track-one-p1-takea.mp3',
    trackTitle: 'Track One',
  }),
}));
vi.mock('@/lib/settings/store', () => ({
  loadSettings: async () => ({ ...DEFAULT_SETTINGS, variationCreditAllowance: 50 }),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    takeProvenance: { findUnique: async () => ({ style: 'warm bass and a steady hook' }) },
    variationRequest: { aggregate: async () => ({ _sum: { creditsReserved: 0 } }) },
  },
}));
vi.mock('@/lib/variations/webhook', () => ({
  variationWebhookConfigured: () => state.configured,
  callVariationWebhook: state.webhook,
}));

import { loadVariationQuote } from '@/lib/variations/service';

const input = {
  id: 'bdb30a82-2b40-4ebf-b5ce-3d8a99541ddf',
  trackNumber: 1,
  parentTakeFilename: 'v1-01-track-one-p1-takea.mp3',
  requestedTakes: 2,
  instructions: 'more bass',
};

beforeEach(() => {
  state.configured = false;
  state.webhook.mockReset();
});

describe('variation quote without a webhook', () => {
  it('keeps parent style and does not call a webhook', async () => {
    const loaded = await loadVariationQuote(input);
    expect(state.webhook).not.toHaveBeenCalled();
    expect(loaded.liveAccountChecked).toBe(false);
    expect(loaded.context.parentStyle).toBe('warm bass and a steady hook');
    expect(loaded.quote).toMatchObject({ generationCredits: 10, expectedOutputs: 2, blockers: [] });
    expect(JSON.stringify(loaded.quote)).not.toMatch(/webhook/i);
  });
});
