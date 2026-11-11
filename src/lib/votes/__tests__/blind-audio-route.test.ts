// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  play: false,
  owner: false,
  allowUnpinned: false,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/votes/voter', () => ({
  canPlayBlindTake: async () => state.play,
}));
vi.mock('@/lib/owner/auth', () => ({
  OWNER_VISITOR_ID: 'owner',
  isOwnerRequest: () => state.owner,
}));
vi.mock('@/lib/votes/pass-store', () => ({
  getVisitorCurrentRound: async () => 1,
  getConsolidatedPassVersion: async () => ({
    tracks: [{ takes: [{ filename: 'v1-01-track-one-p1-takeb.mp3' }] }],
  }),
}));
vi.mock('@/lib/votes/blind', () => ({
  opaqueAudioId: () => 'a'.repeat(32),
  filenameForOpaqueId: async () => 'v1-01-track-one-p1-takeb.mp3',
}));
vi.mock('@/app/api/audio/[set]/[file]/route', () => ({
  serveAudio: async (
    _request: Request,
    _context: unknown,
    options?: { allowUnpinned?: boolean }
  ) => {
    state.allowUnpinned = options?.allowUnpinned === true;
    return new Response('audio', { status: 200 });
  },
}));

import { GET } from '@/app/api/blind-audio/[round]/[token]/route';

const token = 'a'.repeat(32);

function get(round = 1, requestedToken = token) {
  return GET(new Request(`http://localhost/api/blind-audio/1/${token}`), {
    params: Promise.resolve({ round: String(round), token: requestedToken }),
  });
}

beforeEach(() => {
  state.play = false;
  state.owner = false;
  state.allowUnpinned = false;
});

describe('GET /api/blind-audio', () => {
  it('blocks listeners while listener voting is off', async () => {
    const response = await get();
    expect(response.status).toBe(401);
    expect(state.allowUnpinned).toBe(false);
  });

  it('streams the opaque take for someone allowed to vote', async () => {
    state.play = true;
    const response = await get();
    expect(response.status).toBe(200);
    expect(state.allowUnpinned).toBe(true);
    expect(await response.text()).toBe('audio');
  });
  it('rejects stale rounds and tokens outside the accessible pass', async () => {
    state.play = true;
    expect((await get(2)).status).toBe(404);
    expect((await get(1, 'b'.repeat(32))).status).toBe(404);
    expect(state.allowUnpinned).toBe(false);
  });
});
