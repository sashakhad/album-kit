import { NextResponse } from 'next/server';

import { loadStreamCatalog } from '@/lib/album/stream-catalog';
import { VERIFY_MAX_DURATION_SECONDS, verifyStreamsPass } from '@/lib/album/verify-stream';
import { requireOwner } from '@/lib/owner/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = VERIFY_MAX_DURATION_SECONDS;

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) {
    return denied;
  }
  const body = await request.json().catch(() => null);
  const attempt =
    body !== null &&
    typeof body === 'object' &&
    'attempt' in body &&
    typeof body.attempt === 'number' &&
    Number.isInteger(body.attempt) &&
    body.attempt >= 0 &&
    body.attempt < 100
      ? body.attempt
      : 0;
  const catalog = await loadStreamCatalog();
  const allowed = new Set(catalog.map(entry => entry.streamUrl));
  let urls = [...allowed];
  if (
    body !== null &&
    typeof body === 'object' &&
    'pending' in body &&
    Array.isArray(body.pending)
  ) {
    const pending: string[] = [];
    for (const url of body.pending) {
      if (typeof url === 'string' && allowed.has(url)) {
        pending.push(url);
      }
    }
    urls = pending;
  }
  const pass = await verifyStreamsPass(urls, attempt);
  return NextResponse.json(pass);
}
