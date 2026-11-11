import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

export const OWNER_VISITOR_ID = 'owner';
export const OWNER_COOKIE = 'album_owner';

const OWNER_MESSAGE = 'album-owner-v1';
const OWNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export type OwnerCookieOptions = {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge: number;
};

export function albumKey(): string | null {
  const key = process.env.ALBUM_KEY;
  return key === undefined || key.length === 0 ? null : key;
}

export function ownerCookieValue(key: string): string {
  return createHmac('sha256', key).update(OWNER_MESSAGE).digest('hex');
}

export function ownerCookieOptions(maxAge: number = OWNER_COOKIE_MAX_AGE): OwnerCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

export function isAlbumKey(candidate: unknown): boolean {
  const key = albumKey();
  return key !== null && typeof candidate === 'string' && safeEqual(candidate, key);
}

export function isOwnerRequest(request: Request): boolean {
  const key = albumKey();
  if (key === null) {
    return false;
  }

  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization')?.trim() ?? '')?.[1];
  if (bearer !== undefined && safeEqual(bearer, key)) {
    return true;
  }

  const cookie = readCookie(request.headers.get('cookie'), OWNER_COOKIE);
  return cookie !== null && safeEqual(cookie, ownerCookieValue(key));
}

export async function isOwner(): Promise<boolean> {
  const key = albumKey();
  if (key === null) {
    return false;
  }

  const store = await cookies();
  const cookie = store.get(OWNER_COOKIE)?.value;
  return cookie !== undefined && safeEqual(cookie, ownerCookieValue(key));
}

export function safeNextPath(next: string | undefined, fallback = '/vote'): string {
  if (
    next === undefined ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    next.includes('\\') ||
    /\s/.test(next) ||
    new URL(next, 'https://album.invalid').origin !== 'https://album.invalid'
  ) {
    return fallback;
  }
  return next;
}

export function requireOwner(request: Request): Response | null {
  if (albumKey() === null) {
    return Response.json({ error: 'ALBUM_KEY is not set' }, { status: 503 });
  }
  if (!isOwnerRequest(request)) {
    return Response.json({ error: 'Owner key required' }, { status: 401 });
  }
  return null;
}

function readCookie(header: string | null, name: string): string | null {
  if (header === null) {
    return null;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }
    return part.slice(separator + 1).trim();
  }
  return null;
}
