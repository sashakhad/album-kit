import { NextResponse } from 'next/server';
import { z } from 'zod';

import { albumKey, requireOwner, safeNextPath } from '@/lib/owner/auth';
import { isOwnerLinkDestination } from '@/lib/owner/destinations';
import { createOwnerSignInLink } from '@/lib/owner/sign-in-links';

export const runtime = 'nodejs';

const bodySchema = z.object({ next: z.string().max(512).optional() });

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const key = albumKey();
  if (key === null)
    return NextResponse.json({ error: 'Album access is unavailable' }, { status: 503 });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid destination' }, { status: 400 });
  const next = safeNextPath(body.data.next, '/settings');
  if ((body.data.next !== undefined && body.data.next !== next) || !isOwnerLinkDestination(next)) {
    return NextResponse.json({ error: 'Invalid destination' }, { status: 400 });
  }

  const { token, expiresAt } = await createOwnerSignInLink(key);
  const url = new URL('/key', request.url);
  url.searchParams.set('next', next);
  url.hash = `owner=${token}`;
  return NextResponse.json(
    { link: url.toString(), expiresAt },
    { status: 201, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
  );
}
