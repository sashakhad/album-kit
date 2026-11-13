// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Job = {
  id: string;
  roundId: string;
  operationId: string;
  promptId: string;
  providerId: string | null;
  status: string;
  output: unknown;
};
const state = vi.hoisted(() => ({ jobs: new Map<string, Job>() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({ requireOwner: () => null }));
vi.mock('@/lib/prisma', () => {
  const tx = {
    generationRound: {
      findUnique: async () => ({
        authorization: {},
        estimate: { generations: 2 },
        status: 'authorized',
        snapshot: {
          prompts: [
            { id: 'p1', trackNumber: 1, lane: 1 },
            { id: 'p2', trackNumber: 1, lane: 2 },
          ],
          settings: { generationsPerPrompt: 1 },
        },
      }),
      updateMany: async () => ({ count: 1 }),
    },
    providerJob: {
      findUnique: async ({ where }: { where: { operationId: string } }) =>
        state.jobs.get(where.operationId) ?? null,
      count: async ({ where }: { where: { promptId?: string } }) =>
        Array.from(state.jobs.values()).filter(
          job => where.promptId === undefined || job.promptId === where.promptId
        ).length,
      create: async ({ data }: { data: Pick<Job, 'roundId' | 'operationId' | 'promptId'> }) => {
        const job: Job = {
          id: `job-${state.jobs.size + 1}`,
          ...data,
          providerId: null,
          status: 'planned',
          output: null,
        };
        state.jobs.set(job.operationId, job);
        return job;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Job> }) => {
        const job = Array.from(state.jobs.values()).find(item => item.id === where.id)!;
        Object.assign(job, data);
        return job;
      },
    },
  };
  return {
    prisma: { ...tx, $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) },
  };
});

import { PATCH, POST } from '@/app/api/owner/rounds/[id]/jobs/route';

const context = { params: Promise.resolve({ id: 'round-1' }) };
function request(body: unknown, method = 'POST') {
  return new Request('http://localhost/api/owner/rounds/round-1/jobs', {
    method,
    body: JSON.stringify(body),
  });
}

beforeEach(() => state.jobs.clear());

describe('provider job ledger', () => {
  it('reuses the operation ID and caps paid generations at the authorized estimate', async () => {
    expect((await POST(request({ operationId: 'p1-run1', promptId: 'p1' }), context)).status).toBe(
      201
    );
    expect((await POST(request({ operationId: 'p1-run1', promptId: 'p1' }), context)).status).toBe(
      200
    );
    expect(state.jobs.size).toBe(1);
    expect((await POST(request({ operationId: 'p1-run2', promptId: 'p1' }), context)).status).toBe(
      409
    );
    expect((await POST(request({ operationId: 'p2-run1', promptId: 'p2' }), context)).status).toBe(
      201
    );
    expect((await POST(request({ operationId: 'p3-run1', promptId: 'p3' }), context)).status).toBe(
      409
    );
    expect(state.jobs.size).toBe(2);
  });

  it('requires a provider ID before reporting generation accepted', async () => {
    await POST(request({ operationId: 'p1-run1', promptId: 'p1' }), context);
    expect(
      (await PATCH(request({ operationId: 'p1-run1', status: 'accepted' }, 'PATCH'), context))
        .status
    ).toBe(400);
    expect(
      (
        await PATCH(
          request(
            { operationId: 'p1-run1', status: 'accepted', providerId: 'suno-job-1' },
            'PATCH'
          ),
          context
        )
      ).status
    ).toBe(200);
    expect(
      (await PATCH(request({ operationId: 'p1-run1', status: 'complete' }, 'PATCH'), context))
        .status
    ).toBe(409);
    expect(
      (
        await PATCH(
          request(
            {
              operationId: 'p1-run1',
              status: 'complete',
              output: {
                takes: [
                  {
                    filename: 'v1-01-track-one-p1-takea.mp3',
                    outputId: 'output-1',
                    downloaded: true,
                    uploaded: true,
                  },
                ],
              },
            },
            'PATCH'
          ),
          context
        )
      ).status
    ).toBe(200);
    expect(
      (await PATCH(request({ operationId: 'p1-run1', status: 'accepted' }, 'PATCH'), context))
        .status
    ).toBe(409);
  });

  it('completes a review take from its stream URL without a download', async () => {
    const clipId = 'clip-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    await POST(request({ operationId: 'p1-stream', promptId: 'p1' }), context);
    const missing = await PATCH(
      request(
        {
          operationId: 'p1-stream',
          status: 'complete',
          output: {
            takes: [
              {
                filename: 'v1-01-track-one-p1-takea.mp3',
                outputId: clipId,
                downloaded: false,
                uploaded: false,
              },
            ],
          },
        },
        'PATCH'
      ),
      context
    );
    expect(missing.status).toBe(409);

    const streamed = await PATCH(
      request(
        {
          operationId: 'p1-stream',
          status: 'complete',
          output: {
            takes: [
              {
                filename: 'v1-01-track-one-p1-takea.mp3',
                outputId: clipId,
                clipId,
                streamUrl: `https://cdn1.suno.ai/${clipId}.mp3`,
                downloaded: false,
                uploaded: false,
              },
            ],
          },
        },
        'PATCH'
      ),
      context
    );
    expect(streamed.status).toBe(200);

    const mp4 = await PATCH(
      request(
        {
          operationId: 'p1-stream',
          status: 'complete',
          output: {
            takes: [
              {
                filename: 'v1-01-track-one-p1-takea.mp3',
                outputId: clipId,
                clipId,
                streamUrl: `https://cdn1.suno.ai/${clipId}.mp4`,
                downloaded: false,
                uploaded: false,
              },
            ],
          },
        },
        'PATCH'
      ),
      context
    );
    expect(mp4.status).toBe(200);
  });
});
