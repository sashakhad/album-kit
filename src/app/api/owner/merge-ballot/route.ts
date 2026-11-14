import { NextResponse } from 'next/server';

import { requireOwner } from '@/lib/owner/auth';
import { countBrowserListenerVotes, mergeBrowserListenerVotes } from '@/lib/votes/merge-ballot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateJson = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) {
    return denied;
  }
  const votes = await countBrowserListenerVotes(request);
  return NextResponse.json({ votes }, { headers: privateJson });
}

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) {
    return denied;
  }
  // Ballot ids come from this browser's cookies, never from the request body.
  const merged = await mergeBrowserListenerVotes(request);
  return NextResponse.json({ merged }, { headers: privateJson });
}
