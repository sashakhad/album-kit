import 'server-only';

import { createHash, createHmac, randomBytes } from 'node:crypto';

import { cookies } from 'next/headers';

import { albumKey, safeEqual } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';

export const VIEWER_COOKIE = 'album_viewer';
const VIEWER_AGE = 60 * 60 * 24 * 30;

export function viewerCookieOptions(maxAge: number = VIEWER_AGE) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

function signature(id: string): string | null {
  const key = albumKey();
  return key === null
    ? null
    : createHmac('sha256', key).update(`album-viewer-v1:${id}`).digest('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createInvite(): Promise<{ token: string; id: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const row = await prisma.accessInvite.create({
    data: { tokenHash: hashToken(token), expiresAt },
  });
  return { token, id: row.id, expiresAt };
}

export async function redeemInvite(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = hashToken(token);
  const now = new Date();
  const result = await prisma.accessInvite.updateMany({
    where: { tokenHash, redeemedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { redeemedAt: now },
  });
  if (result.count !== 1) return null;
  return (await prisma.accessInvite.findUnique({ where: { tokenHash } }))?.id ?? null;
}

export function viewerCookieValue(id: string): string {
  const mac = signature(id);
  if (mac === null) throw new Error('ALBUM_KEY is required');
  return `${id}.${mac}`;
}

async function viewerInviteFromCookie(value: string | undefined): Promise<string | null> {
  if (value === undefined) return null;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;
  const id = value.slice(0, separator);
  const candidate = value.slice(separator + 1);
  const expected = signature(id);
  if (expected === null || !safeEqual(candidate, expected)) return null;
  const row = await prisma.accessInvite.findUnique({ where: { id } });
  return row !== null && row.redeemedAt !== null && row.revokedAt === null ? id : null;
}

function viewerCookieFromHeader(header: string | null): string | undefined {
  const cookie = header
    ?.split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${VIEWER_COOKIE}=`));
  return cookie?.slice(VIEWER_COOKIE.length + 1);
}

export async function isViewer(): Promise<boolean> {
  const store = await cookies();
  return (await viewerInviteFromCookie(store.get(VIEWER_COOKIE)?.value)) !== null;
}

export async function viewerInviteId(): Promise<string | null> {
  const store = await cookies();
  return viewerInviteFromCookie(store.get(VIEWER_COOKIE)?.value);
}

export async function isViewerRequest(request: Request): Promise<boolean> {
  return (await viewerInviteIdFromRequest(request)) !== null;
}

export async function viewerInviteIdFromRequest(request: Request): Promise<string | null> {
  return viewerInviteFromCookie(viewerCookieFromHeader(request.headers.get('cookie')));
}
