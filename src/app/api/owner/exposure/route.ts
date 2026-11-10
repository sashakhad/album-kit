import { NextResponse } from 'next/server';

import { OWNER_VISITOR_ID, requireOwner } from '@/lib/owner/auth';
import { getVisitorCurrentRound } from '@/lib/votes/pass-store';
import { markExposed } from '@/lib/votes/exposure';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const round = await getVisitorCurrentRound(OWNER_VISITOR_ID);
  await markExposed(OWNER_VISITOR_ID, round);
  return NextResponse.json({ round, exposed: true });
}
