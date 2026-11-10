// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ owner: true, round: 2, writes: [] as unknown[] }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({
  isOwnerRequest: () => state.owner,
  OWNER_VISITOR_ID: 'owner',
}));
vi.mock('@/lib/album/album-config', () => ({
  loadAlbumConfig: async () => ({
    tracks: [{ number: 1, title: 'Track One', slug: 'track-one' }],
  }),
}));
vi.mock('@/lib/votes/pass-store', () => ({
  getVisitorCurrentRound: async () => state.round,
  getConsolidatedPassVersion: async () => ({
    tracks: [
      {
        number: 1,
        kind: 'album',
        takes: [{ filename: 'v1-01-track-one-p1-takea.mp3', versionSlug: 'v1', voteLabel: 'A' }],
      },
    ],
  }),
}));
vi.mock('@/lib/votes/blind', () => ({
  opaqueAudioId: (_round: number, filename: string) => `opaque:${filename}`,
}));
vi.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    listenSelection: { upsert: async (args: unknown) => state.writes.push(args) },
  }),
}));

import { POST } from '@/app/api/owner/listen-selections/route';

function request(token: string | null, round = 2) {
  return new Request('http://localhost/api/owner/listen-selections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackNumber: 1, slot: 'main', token, round }),
  });
}

beforeEach(() => {
  state.owner = true;
  state.round = 2;
  state.writes.length = 0;
});

describe('POST /api/owner/listen-selections', () => {
  it('saves a blind alias as a canonical pin without revealing the label in the response', async () => {
    const response = await POST(request('opaque:v1-01-track-one-p1-takea.mp3'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(state.writes[0]).toMatchObject({
      create: { trackNumber: 1, slot: 'main', setId: 'v1', takeLabel: 'A' },
    });
  });

  it('blocks a signed-out or stale final pick', async () => {
    state.owner = false;
    expect((await POST(request('opaque:v1-01-track-one-p1-takea.mp3'))).status).toBe(401);
    state.owner = true;
    expect((await POST(request('opaque:v1-01-track-one-p1-takea.mp3', 1))).status).toBe(409);
    expect(state.writes).toHaveLength(0);
  });

  it('stores an explicit clear even when album.json has a pin', async () => {
    const response = await POST(request(null));
    expect(response.status).toBe(200);
    expect(state.writes[0]).toMatchObject({ create: { setId: null, takeLabel: null } });
  });
});
