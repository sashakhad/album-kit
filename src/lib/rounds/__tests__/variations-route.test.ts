// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  requests: new Map<string, Record<string, unknown>>(),
  rounds: [] as Array<Record<string, unknown>>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({ requireOwner: () => null }));
vi.mock('@/lib/album/album-config', () => ({
  loadAlbumConfig: async () => ({ tracks: [{ number: 1, title: 'Track One', slug: 'track-one' }] }),
}));
vi.mock('@/lib/album/load-album', () => ({
  getSet: async (id: string) =>
    id === 'v1'
      ? {
          tracks: [
            {
              number: 1,
              takes: [{ filename: 'v1-01-track-one-p1-takea.mp3' }],
            },
          ],
        }
      : null,
}));
vi.mock('@/lib/settings/store', () => ({
  loadSettings: async () => ({
    ...(await import('@/lib/settings/schema')).DEFAULT_SETTINGS,
    promptVariations: 5,
    generationsPerPrompt: 1,
  }),
}));
vi.mock('@/lib/prisma', () => {
  const db = {
    variationRequest: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.requests.get(where.id) ?? null,
      findMany: async () => Array.from(state.requests.values()),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, status: 'requested', roundId: null };
        state.requests.set(data.id as string, row);
        return row;
      },
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        const existing = state.requests.get(create.id as string);
        if (existing) return existing;
        const row = { ...create, status: 'requested', roundId: null };
        state.requests.set(create.id as string, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.requests.get(where.id)!;
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status?: string; roundId?: null };
        data: Record<string, unknown>;
      }) => {
        const row = state.requests.get(where.id);
        if (
          !row ||
          (where.status && row.status !== where.status) ||
          (where.roundId === null && row.roundId !== null)
        )
          return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    generationRound: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.rounds.find(round => round.id === where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `round-${state.rounds.length + 1}`, ...data };
        state.rounds.push(row);
        return row;
      },
    },
  };
  return { prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } };
});

import {
  DELETE as cancelVariation,
  GET as getVariation,
  POST as requestVariation,
} from '@/app/api/owner/variations/route';
import { POST as planRound } from '@/app/api/owner/rounds/route';

const id = 'bdb30a82-2b40-4ebf-b5ce-3d8a99541ddf';
const parentTakeFilename = 'v1-01-track-one-p1-takea.mp3';

function post(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.requests.clear();
  state.rounds.length = 0;
});

describe('single-track variation handoff', () => {
  it('saves one request idempotently without starting paid work', async () => {
    const body = {
      id,
      trackNumber: 1,
      parentTakeFilename,
      requestedTakes: 3,
      instructions: 'More bass',
    };
    const first = await requestVariation(post('/api/owner/variations', body));
    expect(first.status).toBe(201);
    expect((await first.json()).request).toMatchObject({ status: 'requested', ...body });
    expect((await requestVariation(post('/api/owner/variations', body))).status).toBe(200);
    expect(state.requests.size).toBe(1);
    expect(state.rounds).toHaveLength(0);
    expect(
      (await getVariation(new Request(`http://localhost/api/owner/variations?id=${id}`))).status
    ).toBe(200);
    expect(
      (await getVariation(new Request('http://localhost/api/owner/variations?id=invalid'))).status
    ).toBe(400);
    expect(
      (
        await getVariation(
          new Request(
            'http://localhost/api/owner/variations?id=41a506f4-0b54-47ba-b561-af79abcaa781'
          )
        )
      ).status
    ).toBe(404);
  });

  it('rejects cross-track parents and changed retry payloads', async () => {
    const body = { id, trackNumber: 1, parentTakeFilename, requestedTakes: 3, instructions: '' };
    expect(
      (await requestVariation(post('/api/owner/variations', { ...body, trackNumber: 2 }))).status
    ).toBe(400);
    await requestVariation(post('/api/owner/variations', body));
    expect(
      (await requestVariation(post('/api/owner/variations', { ...body, requestedTakes: 4 }))).status
    ).toBe(409);
  });

  it('cancels an uncertain ID so a delayed POST cannot create a duplicate', async () => {
    const body = { id, trackNumber: 1, parentTakeFilename, requestedTakes: 3, instructions: '' };
    const canceled = await cancelVariation(
      new Request('http://localhost/api/owner/variations', {
        method: 'DELETE',
        body: JSON.stringify(body),
      })
    );
    expect(canceled.status).toBe(200);
    expect(state.requests.get(id)?.status).toBe('canceled');
    expect((await requestVariation(post('/api/owner/variations', body))).status).toBe(409);
    expect(
      (
        await cancelVariation(
          new Request('http://localhost/api/owner/variations', {
            method: 'DELETE',
            body: JSON.stringify(body),
          })
        )
      ).status
    ).toBe(200);
  });

  it('plans only the selected track with lineage and explicit batch estimate', async () => {
    await requestVariation(
      post('/api/owner/variations', {
        id,
        trackNumber: 1,
        parentTakeFilename,
        requestedTakes: 3,
        instructions: 'More bass',
      })
    );
    const body = {
      variationRequestId: id,
      tracks: 1,
      prompts: [
        {
          id: 'edited-prompt-1',
          trackNumber: 1,
          lane: 2,
          style: 'Warm bass, crisp drums, bright keys.',
          writerHost: 'grok-bot',
          revision: 2,
        },
      ],
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
      },
      hostingChargeEstimateUsd: 0,
      hostingEligibilityVerified: true,
    };
    const crossTrack = await planRound(
      post('/api/owner/rounds', { ...body, prompts: [{ ...body.prompts[0], trackNumber: 2 }] })
    );
    expect(crossTrack.status).toBe(400);
    const response = await planRound(post('/api/owner/rounds', body));
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.estimate).toMatchObject({
      tracks: 1,
      prompts: 1,
      generations: 2,
      expectedOutputs: 4,
    });
    expect(result.round.snapshot.variation).toMatchObject({
      requestId: id,
      parentTakeFilename,
      requestedTakes: 3,
      instructions: 'More bass',
    });
    expect(result.round.authorization).toBeUndefined();
    expect(state.requests.get(id)).toMatchObject({ status: 'planned', roundId: 'round-1' });
    expect((await planRound(post('/api/owner/rounds', body))).status).toBe(200);
    expect(state.rounds).toHaveLength(1);
    expect(
      (
        await cancelVariation(
          new Request('http://localhost/api/owner/variations', {
            method: 'DELETE',
            body: JSON.stringify({
              id,
              trackNumber: 1,
              parentTakeFilename,
              requestedTakes: 3,
              instructions: 'More bass',
            }),
          })
        )
      ).status
    ).toBe(409);
    const canceledId = '41a506f4-0b54-47ba-b561-af79abcaa781';
    await cancelVariation(
      new Request('http://localhost/api/owner/variations', {
        method: 'DELETE',
        body: JSON.stringify({
          id: canceledId,
          trackNumber: 1,
          parentTakeFilename,
          requestedTakes: 3,
          instructions: '',
        }),
      })
    );
    expect(
      (await planRound(post('/api/owner/rounds', { ...body, variationRequestId: canceledId })))
        .status
    ).toBe(409);
    expect(state.rounds).toHaveLength(1);
  });
});
