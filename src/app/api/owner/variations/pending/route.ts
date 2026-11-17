import { NextResponse } from 'next/server';

import { requireOwner } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';
import { isAwaitingWorker } from '@/lib/variations/pull';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const now = new Date();
  const rows = await prisma.variationRequest.findMany({
    where: {
      status: 'generating',
      OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }],
    },
    orderBy: { createdAt: 'asc' },
  });
  const operations = [];
  for (const row of rows) {
    if (!isAwaitingWorker(row, now) || row.workerPayload === null) continue;
    operations.push({
      operationId: row.id,
      status: 'generating' as const,
      creditsReserved: row.creditsReserved,
      roundId: row.roundId,
      claimExpiresAt: row.claimExpiresAt?.toISOString() ?? null,
      payload: row.workerPayload,
    });
  }
  return NextResponse.json({ operations });
}
