// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { isOwnerRequest, requireOwner, safeEqual } from '../auth';

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/votes', { headers });
}

describe('write token', () => {
  it('accepts the bearer token and rejects anything else', async () => {
    vi.stubEnv('ALBUM_WRITE_TOKEN', 'dev-write-token');

    expect(await isOwnerRequest(requestWith({ authorization: 'Bearer dev-write-token' }))).toBe(
      true
    );
    expect(await isOwnerRequest(requestWith({ authorization: 'Bearer nope' }))).toBe(false);
    expect(await isOwnerRequest(requestWith({ authorization: 'Basic dev-write-token' }))).toBe(
      false
    );
    expect(await isOwnerRequest(requestWith({}))).toBe(false);
    expect(await requireOwner(requestWith({ authorization: 'Bearer dev-write-token' }))).toBeNull();

    vi.unstubAllEnvs();
  });

  it('returns 503 when the token is missing and 401 when it is wrong', async () => {
    vi.stubEnv('ALBUM_WRITE_TOKEN', '');
    const missing = await requireOwner(requestWith({ authorization: 'Bearer dev-write-token' }));
    expect(missing?.status).toBe(503);
    expect(await missing?.json()).toEqual({ error: 'ALBUM_WRITE_TOKEN is not set' });

    vi.stubEnv('ALBUM_WRITE_TOKEN', 'dev-write-token');
    const wrong = await requireOwner(requestWith({ authorization: 'Bearer nope' }));
    expect(wrong?.status).toBe(401);
    expect(await wrong?.json()).toEqual({ error: 'Write token required' });
    vi.unstubAllEnvs();
  });

  it('treats a length difference as a mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
