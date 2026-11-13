// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as Array<{
    filename: string;
    clipId: string | null;
    outputId: string | null;
    streamUrl: string | null;
  }>,
  updates: [] as Array<{ filename: string; data: Record<string, unknown> }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({ requireOwner: () => null }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    takeProvenance: {
      findMany: async () => state.rows,
      update: async ({
        where,
        data,
      }: {
        where: { filename: string };
        data: Record<string, unknown>;
      }) => {
        state.updates.push({ filename: where.filename, data });
        return { filename: where.filename, ...data };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

import { POST } from '@/app/api/owner/streams/refresh/route';

const clipId = 'clip-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  state.rows = [];
  state.updates = [];
  vi.unstubAllGlobals();
});

describe('POST /api/owner/streams/refresh', () => {
  it('writes the library audio_url when the stored link is missing', async () => {
    state.rows = [
      {
        filename: 'v1-01-track-one-p1-takea.mp3',
        clipId,
        outputId: null,
        streamUrl: null,
      },
    ];
    const response = await POST(
      new Request('http://localhost/api/owner/streams/refresh', {
        method: 'POST',
        body: JSON.stringify({
          clips: [{ id: clipId, audio_url: `https://cdn1.suno.ai/${clipId}.mp3` }],
        }),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.updated).toEqual([
      {
        filename: 'v1-01-track-one-p1-takea.mp3',
        clipId,
        streamUrl: `https://cdn1.suno.ai/${clipId}.mp3`,
      },
    ]);
    expect(state.updates[0]?.data).toMatchObject({
      clipId,
      streamUrl: `https://cdn1.suno.ai/${clipId}.mp3`,
      outputId: clipId,
    });
    expect(body.unchanged).toBe(0);
    expect(body.problems).toEqual([]);
  });

  it('resolves a public clip MP4 when no audio_url is given', async () => {
    state.rows = [
      {
        filename: 'v1-01-track-one-p1-takea.mp3',
        clipId,
        outputId: clipId,
        streamUrl: null,
      },
    ];
    const videoUrl = `https://cdn1.suno.ai/${clipId}.mp4`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          is_public: true,
          audio_url: 'https://studio-api.prod.suno.com/api/forbidden',
          video_url: videoUrl,
        })
      )
    );
    const response = await POST(
      new Request('http://localhost/api/owner/streams/refresh', {
        method: 'POST',
        body: JSON.stringify({ clips: [{ id: clipId }] }),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.updated).toEqual([
      {
        filename: 'v1-01-track-one-p1-takea.mp3',
        clipId,
        streamUrl: videoUrl,
      },
    ]);
    expect(body.problems).toEqual([]);
    expect(state.updates[0]?.data).toMatchObject({ clipId, streamUrl: videoUrl });
  });

  it('reports a private clip instead of writing a stream', async () => {
    state.rows = [
      {
        filename: 'v1-01-track-one-p1-takea.mp3',
        clipId,
        outputId: clipId,
        streamUrl: null,
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ is_public: false }, { status: 200 }))
    );
    const response = await POST(
      new Request('http://localhost/api/owner/streams/refresh', {
        method: 'POST',
        body: JSON.stringify({ clips: [{ id: clipId }] }),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.updated).toEqual([]);
    expect(body.problems).toEqual([{ clipId, problem: 'publish the clip on Suno' }]);
    expect(state.updates).toEqual([]);
  });
});
