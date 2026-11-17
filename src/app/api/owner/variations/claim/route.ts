import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireOwner } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';
import { CLAIM_LEASE_MS, decideClaim } from '@/lib/variations/pull';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const claimSchema = z.object({
  operationId: z.uuid(),
  claimToken: z.uuid().optional(),
});

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const parsed = claimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid claim.' }, { status: 400 });
  const input = parsed.data;
  const now = new Date();
  const row = await prisma.variationRequest.findUnique({ where: { id: input.operationId } });
  const decision = decideClaim({
    row,
    operationId: input.operationId,
    claimToken: input.claimToken,
    now,
    nextToken: randomUUID(),
    leaseMs: CLAIM_LEASE_MS,
  });
  if (decision.type === 'missing')
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  if (decision.type === 'unavailable')
    return NextResponse.json(
      { error: 'This request is not waiting for a worker.' },
      { status: 409 }
    );
  if (decision.type === 'held')
    return NextResponse.json({ error: 'This operation is already claimed.' }, { status: 409 });
  if (row === null || row.workerPayload === null)
    return NextResponse.json({ error: 'This operation has no worker payload.' }, { status: 409 });
  const changed = await prisma.variationRequest.updateMany({
    where: decision.refresh
      ? { id: input.operationId, status: 'generating', claimToken: decision.claimToken }
      : {
          id: input.operationId,
          status: 'generating',
          OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }],
        },
    data: { claimToken: decision.claimToken, claimExpiresAt: decision.claimExpiresAt },
  });
  if (changed.count !== 1)
    return NextResponse.json({ error: 'This operation is already claimed.' }, { status: 409 });
  return NextResponse.json({
    operationId: row.id,
    claimToken: decision.claimToken,
    claimExpiresAt: decision.claimExpiresAt.toISOString(),
    roundId: row.roundId,
    creditsReserved: row.creditsReserved,
    payload: row.workerPayload,
  });
}
