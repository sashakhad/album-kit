import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  denied: null as Response | null,
  votes: 0,
  merged: 0,
  counted: 0,
  mergedCalls: 0,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({
  requireOwner: () => state.denied,
}));
vi.mock('@/lib/votes/merge-ballot', () => ({
  countBrowserListenerVotes: async () => {
    state.counted += 1;
    return state.votes;
  },
  mergeBrowserListenerVotes: async () => {
    state.mergedCalls += 1;
    return state.merged;
  },
}));

import { GET, POST } from '@/app/api/owner/merge-ballot/route';

beforeEach(() => {
  state.denied = null;
  state.votes = 0;
  state.merged = 0;
  state.counted = 0;
  state.mergedCalls = 0;
});

describe('owner merge ballot route', () => {
  it('requires the owner', async () => {
    state.denied = Response.json({ error: 'Owner key required' }, { status: 401 });
    const request = new Request('http://localhost/api/owner/merge-ballot', {
      method: 'POST',
      body: JSON.stringify({ visitorId: 'listener:victim' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(state.mergedCalls).toBe(0);
  });

  it('reports how many listener votes this browser can merge', async () => {
    state.votes = 1234;
    const response = await GET(new Request('http://localhost/api/owner/merge-ballot'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ votes: 1234 });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('merges the browser ballot and ignores a visitor id in the body', async () => {
    state.merged = 2;
    const response = await POST(
      new Request('http://localhost/api/owner/merge-ballot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: 'listener:someone-else' }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ merged: 2 });
    expect(state.mergedCalls).toBe(1);
    expect(state.counted).toBe(0);
  });
});
