import { NextResponse } from 'next/server';

import { loadStreamCatalog } from '@/lib/album/stream-catalog';
import { verifyStreams } from '@/lib/album/verify-stream';
import { requireOwner } from '@/lib/owner/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) {
    return denied;
  }
  const catalog = await loadStreamCatalog();
  const result = await verifyStreams(catalog.map(entry => entry.streamUrl));
  return NextResponse.json({
    ok: result.ok,
    waiting: result.waiting,
    failed: result.failed,
    total: result.total,
    line: result.line,
  });
}
