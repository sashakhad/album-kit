import { NextResponse } from 'next/server';

import { albumKey, requireOwner } from '@/lib/owner/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  return NextResponse.json(
    { key: albumKey() },
    { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } }
  );
}
