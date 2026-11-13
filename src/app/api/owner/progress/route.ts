import { NextResponse } from 'next/server';

import { requireOwner } from '@/lib/owner/auth';
import { loadAlbumProgress } from '@/lib/rounds/load-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) {
    return denied;
  }
  return NextResponse.json(await loadAlbumProgress());
}
