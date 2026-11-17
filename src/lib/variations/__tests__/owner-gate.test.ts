// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/variations/service', () => ({
  loadVariationQuote: async () => {
    throw new Error('a public visitor reached the quote');
  },
}));
vi.mock('@/lib/votes/board', () => ({ getVoteSnapshot: async () => ({ currentRound: 1 }) }));
vi.mock('@/lib/votes/exposure', () => ({ isBlindForSnapshot: async () => false }));

import { POST as generate } from '@/app/api/owner/variations/generate/route';
import { POST as quote } from '@/app/api/owner/variations/quote/route';

const id = 'bdb30a82-2b40-4ebf-b5ce-3d8a99541ddf';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('paid More takes stays off the public site', () => {
  it('rejects a visitor with no owner cookie and does not quote', async () => {
    vi.stubEnv('ALBUM_WRITE_TOKEN', 'dev-write-token');
    const body = JSON.stringify({
      id,
      trackNumber: 1,
      parentTakeFilename: 'v1-01-track-one-p1-takea.mp3',
      requestedTakes: 2,
      instructions: '',
    });
    expect(
      (
        await quote(
          new Request('http://localhost/api/owner/variations/quote', { method: 'POST', body })
        )
      ).status
    ).toBe(401);
    expect(
      (
        await generate(
          new Request('http://localhost/api/owner/variations/generate', {
            method: 'POST',
            body: JSON.stringify({ id, quoteKey: 'a'.repeat(64), confirmExtraCost: true }),
          })
        )
      ).status
    ).toBe(401);
  });
});
