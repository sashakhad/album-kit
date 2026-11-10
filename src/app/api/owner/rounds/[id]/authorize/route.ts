import type { Prisma } from '@/generated/prisma/client';
import { NextResponse } from 'next/server';

import { requireOwner } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';
import type { RoundEstimate } from '@/lib/rounds/preflight';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const { id } = await context.params;
  const round = await prisma.generationRound.findUnique({ where: { id } });
  if (round === null) return NextResponse.json({ error: 'Unknown round' }, { status: 404 });
  if (round.authorization !== null) return NextResponse.json(round);
  const estimate = round.estimate as RoundEstimate;
  if (estimate.blockers.length > 0)
    return NextResponse.json({ error: estimate.blockers }, { status: 409 });
  const raw: unknown = await request.json().catch(() => null);
  if (typeof raw !== 'object' || raw === null || !('approved' in raw) || raw.approved !== true) {
    return NextResponse.json(
      { error: 'Explicit approval for this estimate is required' },
      { status: 400 }
    );
  }
  const authorization = { estimate, approvedAt: new Date().toISOString() };
  const updated = await prisma.generationRound.update({
    where: { id },
    data: {
      authorization: authorization as Prisma.InputJsonValue,
      status: 'authorized',
    },
  });
  return NextResponse.json(updated);
}
