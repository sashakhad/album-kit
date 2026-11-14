// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { DELETE, POST } from '@/app/api/owner/session/route';

import { ownerCookieValue } from '../auth';

function postKey(body: unknown): Request {
  return new Request('http://localhost/api/owner/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv('ALBUM_KEY', 'dev');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/owner/session', () => {
  it('sets the owner cookie for the right key', async () => {
    const response = await POST(postKey({ key: 'dev' }));

    expect(response.status).toBe(204);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`album_owner=${ownerCookieValue('dev')}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=34560000/);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it('marks the cookie secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await POST(postKey({ key: 'dev' }));

    expect(response.headers.get('set-cookie')).toMatch(/Secure/i);
  });

  it('returns 401 for a wrong or missing key', async () => {
    const wrong = await POST(postKey({ key: 'nope' }));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'Wrong password' });
    expect(wrong.headers.get('set-cookie')).toBeNull();

    expect((await POST(postKey({}))).status).toBe(401);
  });

  it('returns 503 when ALBUM_KEY is not set', async () => {
    vi.stubEnv('ALBUM_KEY', '');

    const response = await POST(postKey({ key: 'dev' }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'ALBUM_KEY is not set' });
  });
});

describe('DELETE /api/owner/session', () => {
  it('clears the owner cookie', () => {
    const response = DELETE();

    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toMatch(/album_owner=;.*Max-Age=0/);
  });
});
