// @vitest-environment node
import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieJar = new Map<string, string>();

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

import {
  isOwner,
  isOwnerRequest,
  OWNER_COOKIE,
  OWNER_VISITOR_ID,
  ownerCookieValue,
  requireOwner,
  safeEqual,
  safeNextPath,
} from '../auth';

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/votes', { headers });
}

beforeEach(() => {
  cookieJar.clear();
  vi.stubEnv('ALBUM_KEY', 'dev');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ownerCookieValue', () => {
  it('is the hex HMAC-SHA256 of album-owner-v1 keyed with the album key', () => {
    const expected = createHmac('sha256', 'dev').update('album-owner-v1').digest('hex');

    expect(ownerCookieValue('dev')).toBe(expected);
    expect(ownerCookieValue('dev')).toMatch(/^[0-9a-f]{64}$/);
    expect(ownerCookieValue('other')).not.toBe(expected);
    expect(OWNER_COOKIE).toBe('album_owner');
    expect(OWNER_VISITOR_ID).toBe('owner');
  });
});

describe('isOwnerRequest', () => {
  it('accepts the owner cookie', () => {
    const cookie = `theme=dark; ${OWNER_COOKIE}=${ownerCookieValue('dev')}`;

    expect(isOwnerRequest(requestWith({ cookie }))).toBe(true);
  });

  it('accepts the bearer header', () => {
    expect(isOwnerRequest(requestWith({ authorization: 'Bearer dev' }))).toBe(true);
  });

  it('rejects a wrong key in the header or the cookie', () => {
    expect(isOwnerRequest(requestWith({ authorization: 'Bearer nope' }))).toBe(false);
    expect(isOwnerRequest(requestWith({ authorization: 'Bearer de' }))).toBe(false);
    expect(isOwnerRequest(requestWith({ authorization: 'Basic dev' }))).toBe(false);
    expect(
      isOwnerRequest(requestWith({ cookie: `${OWNER_COOKIE}=${ownerCookieValue('other')}` }))
    ).toBe(false);
    expect(isOwnerRequest(requestWith({ cookie: `${OWNER_COOKIE}=dev` }))).toBe(false);
    expect(isOwnerRequest(requestWith({}))).toBe(false);
  });

  it('rejects everyone when ALBUM_KEY is missing', () => {
    vi.stubEnv('ALBUM_KEY', '');

    expect(isOwnerRequest(requestWith({ authorization: 'Bearer ' }))).toBe(false);
    expect(isOwnerRequest(requestWith({ authorization: 'Bearer dev' }))).toBe(false);
    expect(isOwnerRequest(requestWith({ cookie: `${OWNER_COOKIE}=${ownerCookieValue('')}` }))).toBe(
      false
    );
  });
});

describe('requireOwner', () => {
  it('returns 503 when ALBUM_KEY is missing', async () => {
    vi.stubEnv('ALBUM_KEY', '');

    const response = requireOwner(requestWith({ authorization: 'Bearer dev' }));

    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({ error: 'ALBUM_KEY is not set' });
  });

  it('returns 401 for a wrong key', async () => {
    const response = requireOwner(requestWith({ authorization: 'Bearer nope' }));

    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: 'Owner key required' });
  });

  it('lets the owner through', () => {
    expect(requireOwner(requestWith({ authorization: 'Bearer dev' }))).toBeNull();
    expect(
      requireOwner(requestWith({ cookie: `${OWNER_COOKIE}=${ownerCookieValue('dev')}` }))
    ).toBeNull();
  });
});

describe('isOwner', () => {
  it('reads the owner cookie in server components', async () => {
    expect(await isOwner()).toBe(false);

    cookieJar.set(OWNER_COOKIE, ownerCookieValue('dev'));
    expect(await isOwner()).toBe(true);

    cookieJar.set(OWNER_COOKIE, ownerCookieValue('other'));
    expect(await isOwner()).toBe(false);
  });

  it('is false when ALBUM_KEY is missing', async () => {
    cookieJar.set(OWNER_COOKIE, ownerCookieValue('dev'));
    vi.stubEnv('ALBUM_KEY', '');

    expect(await isOwner()).toBe(false);
  });
});

describe('safeEqual', () => {
  it('treats a length difference as a mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('only follows paths on this site', () => {
    expect(safeNextPath('/studio/track-one')).toBe('/studio/track-one');
    expect(safeNextPath(undefined)).toBe('/vote');
    expect(safeNextPath('https://example.com')).toBe('/vote');
    expect(safeNextPath('//example.com')).toBe('/vote');
    expect(safeNextPath('/\\example.com')).toBe('/vote');
  });
});
