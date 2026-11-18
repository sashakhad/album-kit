// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const attempts = vi.hoisted(() => vi.fn(async () => true));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/votes/attempt-log', () => ({ takeAttempt: attempts }));

import { requireOwner } from '@/lib/owner/auth';
import { LISTENER_COOKIE } from '@/lib/votes/listener-id';
import { resolveVoter } from '../voter';

function request(cookie?: string) {
  return new Request('http://localhost/api/votes', {
    headers: cookie === undefined ? {} : { cookie: `${LISTENER_COOKIE}=${cookie}` },
  });
}

beforeEach(() => {
  vi.stubEnv('ALBUM_WRITE_TOKEN', 'test-signing-key');
  attempts.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe('public listener ballots', () => {
  it('gives each browser its own ballot and reuses its signed cookie', async () => {
    const first = await resolveVoter(request());
    const second = await resolveVoter(request());
    if (!('voter' in first && first.voter.kind === 'listener' && first.voter.issuedCookie)) {
      throw new Error('Expected a new public listener ballot');
    }
    expect(second).toMatchObject({ voter: { kind: 'listener' } });
    expect(second).not.toEqual(first);
    const returning = request(first.voter.issuedCookie);
    expect(await resolveVoter(returning)).toEqual({
      voter: { kind: 'listener', visitorId: first.voter.visitorId, issuedCookie: null },
    });
    expect((await requireOwner(returning))?.status).toBe(401);
    expect(attempts).toHaveBeenCalledTimes(2);
  });

  it('still limits the creation of anonymous ballots', async () => {
    attempts.mockResolvedValueOnce(false);
    const result = await resolveVoter(request());
    expect('error' in result && result.error.status).toBe(429);
  });

  it('reports an unconfigured ballot without issuing an unsigned identity', async () => {
    vi.stubEnv('ALBUM_WRITE_TOKEN', '');
    const result = await resolveVoter(request());
    expect('error' in result && result.error.status).toBe(503);
  });
});
