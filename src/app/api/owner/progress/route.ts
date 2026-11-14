import { NextResponse } from 'next/server';

import { requireOwner } from '@/lib/owner/auth';
import { loadAlbumProgress } from '@/lib/rounds/load-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) {
    return denied;
  }
  const progress = await loadAlbumProgress();
  return NextResponse.json(
    {
      ...progress,
      line: progress.line.length > 0 ? progress.line : 'No generation round yet.',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
