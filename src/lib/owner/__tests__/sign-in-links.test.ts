// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => new Map<string, Date>());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    ownerSignInLink: {
      create: async ({ data }: { data: { tokenHash: string; expiresAt: Date } }) => {
        rows.set(data.tokenHash, data.expiresAt);
      },
      deleteMany: async ({
        where,
      }: {
        where: { tokenHash?: string; expiresAt: { gt?: Date; lte?: Date } };
      }) => {
        let count = 0;
        for (const [hash, expiresAt] of rows) {
          if (where.tokenHash !== undefined && hash !== where.tokenHash) continue;
          if (where.expiresAt.gt !== undefined && expiresAt <= where.expiresAt.gt) continue;
          if (where.expiresAt.lte !== undefined && expiresAt > where.expiresAt.lte) continue;
          rows.delete(hash);
          count += 1;
        }
        return { count };
      },
    },
  },
}));

import { POST as issueLink } from '@/app/api/owner/sign-in-links/route';
import { POST as signIn } from '@/app/api/owner/session/route';
import { ownerCookieValue } from '../auth';

function issue(next: string, owner = true) {
  return issueLink(
    new Request('https://album.example/api/owner/sign-in-links', {
      method: 'POST',
      headers: owner ? { authorization: 'Bearer test-owner-key' } : {},
      body: JSON.stringify({ next }),
    })
  );
}

async function openToken(next = '/settings') {
  const response = await issue(next);
  expect(response.status).toBe(201);
  const body = await response.json();
  const link = new URL(body.link);
  expect(link.origin).toBe('https://album.example');
  expect(link.searchParams.get('next')).toBe(next);
  expect(link.hash).toMatch(/^#owner=[\w-]{43}$/);
  return { token: link.hash.slice('#owner='.length), expiresAt: new Date(body.expiresAt) };
}

function redeem(token: string) {
  return signIn(
    new Request('https://album.example/api/owner/session', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  );
}

beforeEach(() => {
  rows.clear();
  vi.stubEnv('ALBUM_KEY', 'test-owner-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('owner handoff links', () => {
  it('requires owner credentials and rejects off-site destinations', async () => {
    expect((await issue('/settings', false)).status).toBe(401);
    expect((await issue('//another.example')).status).toBe(400);
    expect(rows.size).toBe(0);
  });

  it('opens the intended page and cannot be redeemed twice, even concurrently', async () => {
    const { token } = await openToken('/vote/track-one/v1/a');
    expect(rows.has(token)).toBe(false);
    const responses = await Promise.all([redeem(token), redeem(token)]);
    expect(responses.map(response => response.status).sort()).toEqual([204, 410]);
    expect(responses.find(response => response.ok)?.headers.get('set-cookie')).toContain(
      `album_owner=${ownerCookieValue('test-owner-key')}`
    );
  });

  it('stays valid for seven days, works once, and is invalidated by rotating the key', async () => {
    vi.useFakeTimers();
    const { token, expiresAt } = await openToken();
    expect(expiresAt.getTime() - Date.now()).toBe(7 * 24 * 60 * 60 * 1000);
    vi.setSystemTime(expiresAt);
    expect((await redeem(token)).status).toBe(410);
    const next = await openToken();
    vi.stubEnv('ALBUM_KEY', 'new-owner-key');
    expect((await redeem(next.token)).status).toBe(410);
  });
});
