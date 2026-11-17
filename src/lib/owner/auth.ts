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

/** Server secret for write requests and for signing cookies. Never send it to the browser. */
export function writeToken(): string | null {
  const token = process.env.ALBUM_WRITE_TOKEN;
  return token === undefined || token.length === 0 ? null : token;
}

/** HMAC key. Same value as the write token. */
export function albumKey(): string | null {
  return writeToken();
}

/** Cookie value proves the browser redeemed an owner link. It is not the write token. */
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

export function isWriteRequest(request: Request): boolean {
  const token = writeToken();
  if (token === null) return false;
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization')?.trim() ?? '')?.[1];
  return bearer !== undefined && safeEqual(bearer, token);
}

function readCookie(header: string | null, name: string): string | null {
  if (header === null) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

function hasOwnerCookie(value: string | null | undefined, token: string): boolean {
  return value !== null && value !== undefined && safeEqual(value, ownerCookieValue(token));
}

/** Bearer write token, or the httpOnly cookie set by a one-time owner link. */
export async function isOwnerRequest(request: Request): Promise<boolean> {
  const token = writeToken();
  if (token === null) return false;
  if (isWriteRequest(request)) return true;
  return hasOwnerCookie(readCookie(request.headers.get('cookie'), OWNER_COOKIE), token);
}

export async function isOwner(): Promise<boolean> {
  const token = writeToken();
  if (token === null) return false;
  const store = await cookies();
  return hasOwnerCookie(store.get(OWNER_COOKIE)?.value, token);
}

export async function requireOwner(request: Request): Promise<Response | null> {
  if (writeToken() === null) {
    return Response.json({ error: 'ALBUM_WRITE_TOKEN is not set' }, { status: 503 });
  }
  if (!(await isOwnerRequest(request))) {
    return Response.json({ error: 'Write token required' }, { status: 401 });
  }
  return null;
}
