// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  row: null as null | { version: number; defaults: unknown; overrides: unknown },
  owner: true,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({
  requireOwner: () =>
    state.owner ? null : Response.json({ error: 'Owner key required' }, { status: 401 }),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    albumSettings: {
      findUnique: async () => state.row,
      upsert: async ({
        create,
        update,
      }: {
        create: typeof state.row;
        update: typeof state.row;
      }) => {
        state.row = state.row === null ? create : update;
        return state.row;
      },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        albumSettings: {
          findUnique: async () => state.row,
          upsert: async ({
            create,
            update,
          }: {
            create: typeof state.row;
            update: typeof state.row;
          }) => {
            state.row = state.row === null ? create : update;
            return state.row;
          },
        },
      }),
  },
}));

import { GET, PATCH } from '@/app/api/owner/settings/route';
import { loadSettings } from '../store';

beforeEach(() => {
  state.row = null;
  state.owner = true;
});

describe('shared settings storage', () => {
  it('persists a site edit for a later chat API read and server read', async () => {
    const request = new Request('http://localhost/api/owner/settings', {
      method: 'PATCH',
      body: JSON.stringify({ patch: { promptVariations: 2, listeningDetails: 'keep-hidden' } }),
    });
    expect((await PATCH(request)).status).toBe(200);
    expect((await loadSettings()).promptVariations).toBe(2);
    const response = await GET(new Request('http://localhost/api/owner/settings'));
    expect((await response.json()).resolved.listeningDetails).toBe('keep-hidden');
  });

  it('keeps unauthenticated listeners away from settings writes', async () => {
    state.owner = false;
    const response = await PATCH(
      new Request('http://localhost/api/owner/settings', {
        method: 'PATCH',
        body: JSON.stringify({ patch: { promptVariations: 1 } }),
      })
    );
    expect(response.status).toBe(401);
    expect(state.row).toBeNull();
  });
});
