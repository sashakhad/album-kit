// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  requests: new Map<string, Record<string, unknown>>(),
  rounds: [] as Array<Record<string, unknown>>,
  blind: false,
  owner: true,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({
  OWNER_VISITOR_ID: 'owner',
  requireOwner: () => (state.owner ? null : new Response('Unauthorized', { status: 401 })),
}));
vi.mock('@/lib/votes/blind', () => ({
  opaqueAudioId: (_round: number, filename: string) =>
    filename === 'v1-01-track-one-p1-takea.mp3' ? 'a'.repeat(32) : 'b'.repeat(32),
  filenameForOpaqueId: async (_round: number, token: string) =>
    token === 'a'.repeat(32) ? 'v1-01-track-one-p1-takea.mp3' : null,
}));
vi.mock('@/lib/votes/board', () => ({
  getVoteSnapshot: async () => ({ currentRound: 1, mine: {} }),
}));
vi.mock('@/lib/votes/exposure', () => ({
  isBlindForSnapshot: async () => state.blind,
}));
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
    listeningDetails: state.blind ? 'keep-hidden' : 'visible',
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

function roundBody() {
  return {
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
}

beforeEach(() => {
  state.requests.clear();
  state.rounds.length = 0;
  state.blind = false;
  state.owner = true;
});

describe('single-track variation handoff', () => {
  it('accepts a blind take token without exposing the canonical parent in request responses', async () => {
    state.blind = true;
    const body = {
      id,
      trackNumber: 1,
      parentTakeToken: 'a'.repeat(32),
      sourceRound: 1,
      requestedTakes: 3,
      instructions: 'More bass',
    };
    const first = await requestVariation(post('/api/owner/variations', body));
    expect(first.status).toBe(201);
    expect(JSON.stringify(await first.json())).not.toContain(parentTakeFilename);
    expect(state.requests.get(id)?.parentTakeFilename).toBe(parentTakeFilename);
    const retry = await requestVariation(post('/api/owner/variations', body));
    expect(retry.status).toBe(200);
    expect(JSON.stringify(await retry.json())).not.toContain(parentTakeFilename);
    const changedParent = await requestVariation(
      post('/api/owner/variations', { ...body, parentTakeToken: 'b'.repeat(32) })
    );
    expect(changedParent.status).toBe(409);
    expect(JSON.stringify(await changedParent.json())).not.toContain(parentTakeFilename);
    const item = await getVariation(
      new Request(`http://localhost/api/owner/variations?id=${id}&sourceRound=1`)
    );
    expect(item.status).toBe(200);
    expect(await item.json()).toMatchObject({ parentTakeToken: body.parentTakeToken });
    const unscopedItem = await getVariation(
      new Request(`http://localhost/api/owner/variations?id=${id}`)
    );
    expect(JSON.stringify(await unscopedItem.json())).not.toContain(parentTakeFilename);
    const listed = await getVariation(new Request('http://localhost/api/owner/variations'));
    expect(JSON.stringify(await listed.json())).not.toContain(parentTakeFilename);
    const canceled = await cancelVariation(
      new Request('http://localhost/api/owner/variations', {
        method: 'DELETE',
        body: JSON.stringify(body),
      })
    );
    expect(canceled.status).toBe(200);
    expect(JSON.stringify(await canceled.json())).not.toContain(parentTakeFilename);
    expect((await requestVariation(post('/api/owner/variations', body))).status).toBe(409);
    state.blind = false;
    const revealed = await getVariation(new Request('http://localhost/api/owner/variations'));
    expect(JSON.stringify(await revealed.json())).toContain(parentTakeFilename);
  });

  it('keeps blind request and status endpoints owner-only', async () => {
    state.owner = false;
    const body = {
      id,
      trackNumber: 1,
      parentTakeToken: 'a'.repeat(32),
      sourceRound: 1,
      requestedTakes: 2,
    };
    expect((await requestVariation(post('/api/owner/variations', body))).status).toBe(401);
    expect((await getVariation(new Request('http://localhost/api/owner/variations'))).status).toBe(
      401
    );
    expect(state.requests.size).toBe(0);
  });

  it('keeps a blind request pending, then plans its canonical parent only after reveal', async () => {
    state.blind = true;
    const blindRequest = {
      id,
      trackNumber: 1,
      parentTakeToken: 'a'.repeat(32),
      sourceRound: 1,
      requestedTakes: 3,
      instructions: 'More bass',
    };
    expect((await requestVariation(post('/api/owner/variations', blindRequest))).status).toBe(201);
    const body = roundBody();
    const blocked = await planRound(post('/api/owner/rounds', body));
    expect(blocked.status).toBe(409);
    expect(JSON.stringify(await blocked.json())).not.toContain(parentTakeFilename);
    expect(state.rounds).toHaveLength(0);
    state.blind = false;
    const revealed = await getVariation(
      new Request(`http://localhost/api/owner/variations?id=${id}`)
    );
    expect((await revealed.json()).parentTakeFilename).toBe(parentTakeFilename);
    const planned = await planRound(post('/api/owner/rounds', body));
    expect(planned.status).toBe(201);
    const result = await planned.json();
    expect(result.round.snapshot.variation.parentTakeFilename).toBe(parentTakeFilename);
    expect(result.round.authorization).toBeUndefined();
    expect(state.requests.get(id)).toMatchObject({ status: 'planned', roundId: 'round-1' });
  });

  it('rejects unknown blind tokens and malformed source rounds before saving', async () => {
    const body = {
      id,
      trackNumber: 1,
      parentTakeToken: 'c'.repeat(32),
      sourceRound: 1,
      requestedTakes: 2,
    };
    expect((await requestVariation(post('/api/owner/variations', body))).status).toBe(400);
    expect(
      (await requestVariation(post('/api/owner/variations', { ...body, sourceRound: 0 }))).status
    ).toBe(400);
    expect(
      (
        await getVariation(
          new Request(`http://localhost/api/owner/variations?id=${id}&sourceRound=invalid`)
        )
      ).status
    ).toBe(400);
    expect(state.requests.size).toBe(0);
  });

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
    const body = roundBody();
    state.blind = true;
    const blocked = await planRound(post('/api/owner/rounds', body));
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toContain('Reveal this pass');
    expect(state.rounds).toHaveLength(0);
    state.blind = false;
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
    state.blind = true;
    const hiddenRetry = await planRound(post('/api/owner/rounds', body));
    expect(hiddenRetry.status).toBe(409);
    expect(JSON.stringify(await hiddenRetry.json())).not.toContain(parentTakeFilename);
    state.blind = false;
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
