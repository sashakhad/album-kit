import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';

import { prisma } from '@/lib/prisma';

/** Single use. Long enough that a link sent in chat is still good when the owner returns. */
export const OWNER_LINK_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string, key: string): string {
  return createHmac('sha256', key).update(`album-owner-link-v1:${token}`).digest('hex');
}

export async function createOwnerSignInLink(key: string) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OWNER_LINK_AGE_MS);
  await prisma.ownerSignInLink.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.ownerSignInLink.create({ data: { tokenHash: hashToken(token, key), expiresAt } });
  return { token, expiresAt };
}

export async function consumeOwnerSignInLink(token: string, key: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  // One conditional delete makes redemption single use, including concurrent requests.
  const result = await prisma.ownerSignInLink.deleteMany({
    where: { tokenHash: hashToken(token, key), expiresAt: { gt: new Date() } },
  });
  return result.count === 1;
}
