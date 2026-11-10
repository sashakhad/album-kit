import { NextResponse } from 'next/server';

import { requireOwner } from '@/lib/owner/auth';
import { createInvite } from '@/lib/owner/viewer';
import { prisma } from '@/lib/prisma';
import { loadSettings } from '@/lib/settings/store';
import { privateStoreReady } from '@/lib/album/blob-audio';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const rows = await prisma.accessInvite.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, expiresAt: true, redeemedAt: true, revokedAt: true, createdAt: true },
  });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const settings = await loadSettings();
  if (settings.visibility !== 'private' || !(await privateStoreReady())) {
    return NextResponse.json(
      { error: 'Private visibility and private storage are required' },
      { status: 409 }
    );
  }
  const invite = await createInvite();
  const origin = new URL(request.url).origin;
  return NextResponse.json(
    { id: invite.id, expiresAt: invite.expiresAt, link: `${origin}/access#${invite.token}` },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}
