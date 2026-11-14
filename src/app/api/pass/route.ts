import { NextResponse } from 'next/server';
import { z } from 'zod';

import { OWNER_VISITOR_ID, requireOwner } from '@/lib/owner/auth';
import { getVoteSnapshot } from '@/lib/votes/board';
import { advanceVisitorRound, PassAlreadyChangedError } from '@/lib/votes/pass-store';
import { blindSnapshot } from '@/lib/votes/blind';
import { loadSettings } from '@/lib/settings/store';
import { isBlindForSnapshot, markExposed } from '@/lib/votes/exposure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const passBodySchema = z.object({
  action: z.literal('next'),
  expectedRound: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) {
    return denied;
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = passBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad pass' }, { status: 400 });
  }
  let currentRound: number;
  try {
    currentRound = await advanceVisitorRound(OWNER_VISITOR_ID, parsed.data.expectedRound);
  } catch (error) {
    if (error instanceof PassAlreadyChangedError)
      return NextResponse.json({ error: 'Pass already changed' }, { status: 409 });
    throw error;
  }
  const snapshot = await getVoteSnapshot(OWNER_VISITOR_ID);
  const settings = await loadSettings();
  const blind = await isBlindForSnapshot(OWNER_VISITOR_ID, settings.listeningDetails, snapshot);
  if (!blind) await markExposed(OWNER_VISITOR_ID, snapshot.currentRound);
  return NextResponse.json({
    currentRound,
    snapshot: blind ? await blindSnapshot(snapshot) : snapshot,
  });
}
