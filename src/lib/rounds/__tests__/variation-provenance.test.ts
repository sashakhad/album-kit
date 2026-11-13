// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ saved: null as Record<string, unknown> | null }));

vi.mock('@/lib/owner/auth', () => ({ requireOwner: () => null }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    generationRound: {
      findUnique: async () => ({
        snapshot: {
          resolvedSunoModel: 'v6',
          prompts: [
            {
              id: 'revision-2',
              trackNumber: 1,
              lane: 2,
              style: 'Warm bass and crisp drums.',
              writerHost: 'grok-bot',
              writerProvider: null,
              requestedModel: null,
              observedModel: null,
              revision: 2,
              executionId: null,
            },
          ],
          variation: {
            requestId: 'request-1',
            parentTakeFilename: 'v1-01-track-one-p1-takea.mp3',
            trackNumber: 1,
            instructions: 'More bass',
          },
        },
      }),
    },
    takeProvenance: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.saved = data;
        return data;
      },
    },
  },
}));

import { POST } from '@/app/api/owner/provenance/route';

describe('variation provenance', () => {
  it('binds each new take to its parent, request, instructions and prompt revision', async () => {
    const response = await POST(
      new Request('http://localhost/api/owner/provenance', {
        method: 'POST',
        body: JSON.stringify({
          filename: 'v1-01-track-one-p2-takeb.mp3',
          promptId: 'revision-2',
          style: 'Warm bass and crisp drums.',
          writerHost: 'grok-bot',
          writerProvider: null,
          requestedModel: null,
          observedModel: null,
          executionId: null,
          promptRevision: 2,
          sunoModel: 'v6',
          generationId: 'generation-1',
          generationSettings: {},
          outputId: 'output-1',
          roundId: 'round-1',
        }),
      })
    );
    expect(response.status).toBe(201);
    expect(state.saved).toMatchObject({
      filename: 'v1-01-track-one-p2-takeb.mp3',
      parentTakeFilename: 'v1-01-track-one-p1-takea.mp3',
      variationRequestId: 'request-1',
      promptInstructions: 'More bass',
      promptRevision: 2,
      sunoModel: 'v6',
    });
  });
});
