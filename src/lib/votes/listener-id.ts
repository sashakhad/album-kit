import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';

import { cookies } from 'next/headers';

import { albumKey, safeEqual } from '@/lib/owner/auth';

export const LISTENER_COOKIE = 'album_listener';
const LISTENER_ID = /^[A-Za-z0-9_-]{22}$/;
const LISTENER_AGE = 60 * 60 * 24 * 400;

export function listenerCookieOptions(maxAge: number = LISTENER_AGE) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export function newListenerId(): string {
  return randomBytes(16).toString('base64url');
}

export function publicListenerVisitorId(id: string): string {
  return `listener:${id}`;
}

export function inviteListenerVisitorId(inviteId: string): string {
  return `listener:invite:${inviteId}`;
}

export { isListenerVisitorId } from '@/lib/votes/identity';

function signListener(id: string): string | null {
  const key = albumKey();
  if (key === null) {
    return null;
  }
  return createHmac('sha256', key).update(`album-listener-v1:${id}`).digest('hex');
}

export function listenerCookieValue(id: string): string {
  const mac = signListener(id);
  if (mac === null) {
    throw new Error('ALBUM_KEY is required');
  }
  return `${id}.${mac}`;
}

export function listenerIdFromCookie(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const separator = value.lastIndexOf('.');
  if (separator <= 0) {
    return null;
  }
  const id = value.slice(0, separator);
  const mac = value.slice(separator + 1);
  if (!LISTENER_ID.test(id)) {
    return null;
  }
  const expected = signListener(id);
  if (expected === null || !safeEqual(mac, expected)) {
    return null;
  }
  return id;
}

export function listenerIdFromRequest(request: Request): string | null {
  return listenerIdFromCookie(readCookie(request.headers.get('cookie'), LISTENER_COOKIE));
}

export async function listenerIdFromPage(): Promise<string | null> {
  const store = await cookies();
  return listenerIdFromCookie(store.get(LISTENER_COOKIE)?.value);
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded !== null && forwarded.trim().length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }
  const real = request.headers.get('x-real-ip');
  return real === null || real.trim().length === 0 ? 'unknown' : real.trim();
}

export function ipHash(ip: string): string {
  const key = albumKey() ?? 'missing';
  return createHmac('sha256', key).update(`album-ip-v1:${ip}`).digest('hex').slice(0, 32);
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
