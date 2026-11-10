import { NextResponse } from 'next/server';
import { z } from 'zod';

import { OWNER_VISITOR_ID, requireOwner } from '@/lib/owner/auth';
import { getVoteSnapshot } from '@/lib/votes/board';
import { advanceVisitorRound } from '@/lib/votes/pass-store';
import { blindSnapshot } from '@/lib/votes/blind';
import { loadSettings } from '@/lib/settings/store';
import { isBlindForSnapshot, markExposed } from '@/lib/votes/exposure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const passBodySchema = z.object({
  action: z.literal('next'),
});

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) {
    return denied;
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = passBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad pass' }, { status: 400 });
  }

  const currentRound = await advanceVisitorRound(OWNER_VISITOR_ID);
  const snapshot = await getVoteSnapshot(OWNER_VISITOR_ID);
  const settings = await loadSettings();
  const blind = await isBlindForSnapshot(OWNER_VISITOR_ID, settings.listeningDetails, snapshot);
  if (!blind) await markExposed(OWNER_VISITOR_ID, snapshot.currentRound);
  return NextResponse.json({
    currentRound,
    snapshot: blind ? await blindSnapshot(snapshot) : snapshot,
  });
}
