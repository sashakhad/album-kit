// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  budget: true,
  casts: [] as { visitorId: string; round?: number; takeLabel: string }[],
  alias: null as string | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/votes/attempt-log', () => ({
  takeAttempt: async () => state.budget,
}));
vi.mock('@/lib/votes/board', () => ({
  safeVoteSnapshot: async () => ({
    tallies: {},
    mine: {},
    downloads: {},
    versionTotals: {},
    currentRound: 1,
  }),
  getVoteSnapshot: async () => ({
    tallies: {},
    mine: {},
    downloads: {},
    versionTotals: {},
    currentRound: 2,
  }),
  castVote: async (args: { visitorId: string; round?: number; takeLabel: string }) => {
    state.casts.push(args);
    return {
      tallies: { 1: { v1: { A: 1 } } },
      mine: { 1: [{ versionSlug: 'v1', takeLabel: 'A', value: 1, round: args.round ?? 1 }] },
      downloads: {},
      versionTotals: { v1: 1 },
      currentRound: args.round ?? 1,
      listenerTallies: { 1: { v1: { A: 99 } } },
    };
  },
}));
vi.mock('@/lib/album/album-config', () => ({
  loadAlbumConfig: async () => ({ tracks: [{ number: 1 }] }),
}));
vi.mock('@/lib/album/load-album', () => ({
  getSet: async () => ({
    slug: 'v1',
    tracks: [
      {
        kind: 'album',
        number: 1,
        audioUrl: '/api/audio/v1/file.mp3',
        takes: [
          {
            versionSlug: 'v1',
            voteLabel: 'A',
            label: 'A',
            filename: 'v1-01-track-one-p1-takea.mp3',
            audioUrl: '/api/audio/v1/file.mp3',
          },
        ],
      },
    ],
  }),
}));
vi.mock('@/lib/settings/store', () => ({
  loadSettings: async () => ({
    listeningDetails: 'visible',
    listenerVoting: false,
    visibility: 'public',
  }),
}));
vi.mock('@/lib/votes/pass-store', () => ({
  getVisitorCurrentRound: async () => 2,
  getConsolidatedPassVersion: async () => ({
    tracks: [
      {
        kind: 'album',
        number: 1,
        takes: [
          {
            versionSlug: 'v1',
            voteLabel: 'A',
            label: 'A',
            filename: 'v1-01-track-one-p1-takea.mp3',
            audioUrl: '/api/blind-audio/2/token',
          },
        ],
        parkedTakes: [],
      },
    ],
  }),
}));
vi.mock('@/lib/votes/exposure', () => ({
  isBlindForSnapshot: async () => false,
  isBlindForListenerSnapshot: async () => false,
  markExposed: async () => undefined,
}));
vi.mock('@/lib/votes/blind', () => ({
  blindSnapshot: async (snapshot: unknown) => snapshot,
  realTakeForAlias: async (args: { alias: string }) => {
    state.alias = args.alias;
    return {
      versionSlug: 'v1',
      voteLabel: 'E',
      label: 'E',
      filename: 'v1-01-track-one-p3-takee.mp3',
      audioUrl: '/api/blind-audio/2/token',
    };
  },
}));

import { POST } from '@/app/api/votes/route';

function voteRequest(
  headers: Record<string, string> = {},
  body: Record<string, unknown> = {}
) {
  return new Request('http://localhost/api/votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ trackNumber: 1, versionSlug: 'v1', takeLabel: 'A', value: 1, ...body }),
  });
}

beforeEach(() => {
  state.casts.length = 0;
  state.alias = null;
  state.budget = true;
  vi.stubEnv('ALBUM_WRITE_TOKEN', 'test-write-token');
});

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/votes', () => {
  it('keeps a shuffled label on the take that was on screen after reveal', async () => {
    const response = await POST(
      voteRequest(
        { authorization: 'Bearer test-write-token' },
        { takeLabel: 'F', blindLabel: true }
      )
    );
    expect(response.status).toBe(200);
    expect(state.alias).toBe('F');
    expect(state.casts[0]?.takeLabel).toBe('E');
  });

  it('records an owner vote on the owner ballot', async () => {
    const response = await POST(voteRequest({ authorization: 'Bearer test-write-token' }));
    expect(response.status).toBe(200);
    expect(state.casts[0]?.visitorId).toBe('owner');
    expect(state.casts[0]?.round).toBeUndefined();
  });

  it('reports an unavailable ballot without casting a vote', async () => {
    vi.stubEnv('ALBUM_WRITE_TOKEN', '');
    const response = await POST(voteRequest());
    expect(response.status).toBe(503);
    expect(state.casts).toHaveLength(0);
  });

  it('opens independent ballots for signed-out browsers on an album with legacy voting disabled', async () => {
    const response = await POST(voteRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.listenerTallies).toBeUndefined();
    expect(body.tallies[1].v1.A).toBe(1);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Missing listener cookie');
    expect(cookie).toMatch(/^album_listener=/);
    expect((await POST(voteRequest({ cookie }))).status).toBe(200);
    expect((await POST(voteRequest())).status).toBe(200);
    const ids = state.casts.map(cast => cast.visitorId);
    expect(ids[0]).toMatch(/^listener:/);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).toMatch(/^listener:/);
    expect(ids[2]).not.toBe(ids[0]);
    expect(state.casts.every(cast => cast.round === 2)).toBe(true);
  });

  it('rate limits a listener ballot', async () => {
    state.budget = false;
    const response = await POST(voteRequest());
    expect(response.status).toBe(429);
    expect(state.casts).toHaveLength(0);
  });
});
