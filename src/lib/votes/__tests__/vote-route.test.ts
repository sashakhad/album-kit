// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  resolved: { voter: { kind: 'owner' as const } } as
    | { voter: { kind: 'owner' } }
    | { voter: { kind: 'listener'; visitorId: string; issuedCookie: string | null } }
    | { error: Response },
  budget: true,
  casts: [] as { visitorId: string; round?: number; takeLabel: string }[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/votes/voter', () => ({
  resolveVoter: async () => state.resolved,
}));
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
    listenerVoting: true,
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
  realTakeForAlias: async () => ({
    versionSlug: 'v1',
    voteLabel: 'A',
    label: 'A',
    filename: 'v1-01-track-one-p1-takea.mp3',
    audioUrl: '/api/blind-audio/2/token',
  }),
}));

import { POST } from '@/app/api/votes/route';

function voteRequest() {
  return new Request('http://localhost/api/votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackNumber: 1, versionSlug: 'v1', takeLabel: 'A', value: 1 }),
  });
}

beforeEach(() => {
  state.casts.length = 0;
  state.budget = true;
  state.resolved = { voter: { kind: 'owner' } };
});

describe('POST /api/votes', () => {
  it('records an owner vote on the owner ballot', async () => {
    const response = await POST(voteRequest());
    expect(response.status).toBe(200);
    expect(state.casts[0]?.visitorId).toBe('owner');
    expect(state.casts[0]?.round).toBeUndefined();
  });

  it('rejects a non-owner while listener voting is closed', async () => {
    state.resolved = {
      error: Response.json({ error: 'Owner key required' }, { status: 401 }),
    };
    const response = await POST(voteRequest());
    expect(response.status).toBe(401);
    expect(state.casts).toHaveLength(0);
  });

  it('stores a public listener vote away from the owner ballot', async () => {
    state.resolved = {
      voter: { kind: 'listener', visitorId: 'listener:abc', issuedCookie: 'abc.sig' },
    };
    const response = await POST(voteRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(state.casts[0]?.visitorId).toBe('listener:abc');
    expect(state.casts[0]?.round).toBe(2);
    expect(body.listenerTallies).toBeUndefined();
    expect(body.tallies[1].v1.A).toBe(1);
    expect(response.headers.get('set-cookie')).toContain('album_listener=');
  });

  it('rate limits a listener ballot', async () => {
    state.budget = false;
    state.resolved = {
      voter: { kind: 'listener', visitorId: 'listener:abc', issuedCookie: null },
    };
    const response = await POST(voteRequest());
    expect(response.status).toBe(429);
    expect(state.casts).toHaveLength(0);
  });
});
