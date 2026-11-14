import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

import { loadOwnerPassword, ownerSecrets } from '@/lib/owner/password';

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

/** The password currently in use. Call loadOwnerPassword first so a settings change is visible. */
export function albumKey(): string | null {
  return ownerSecrets()[0] ?? null;
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
  return (
    typeof candidate === 'string' && ownerSecrets().some(secret => safeEqual(candidate, secret))
  );
}

export async function isOwnerRequest(request: Request): Promise<boolean> {
  await loadOwnerPassword();
  const secrets = ownerSecrets();
  if (secrets.length === 0) return false;

  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization')?.trim() ?? '')?.[1];
  if (bearer !== undefined && secrets.some(secret => safeEqual(bearer, secret))) return true;

  const cookie = readCookie(request.headers.get('cookie'), OWNER_COOKIE);
  return cookie !== null && secrets.some(secret => safeEqual(cookie, ownerCookieValue(secret)));
}

export async function isOwner(): Promise<boolean> {
  await loadOwnerPassword();
  const secrets = ownerSecrets();
  if (secrets.length === 0) return false;
  const store = await cookies();
  const cookie = store.get(OWNER_COOKIE)?.value;
  return (
    cookie !== undefined && secrets.some(secret => safeEqual(cookie, ownerCookieValue(secret)))
  );
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

export async function requireOwner(request: Request): Promise<Response | null> {
  await loadOwnerPassword();
  if (ownerSecrets().length === 0) {
    return Response.json({ error: 'ALBUM_KEY is not set' }, { status: 503 });
  }
  if (!(await isOwnerRequest(request))) {
    return Response.json({ error: 'Owner password required' }, { status: 401 });
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
