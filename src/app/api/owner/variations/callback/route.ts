import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isWriteRequest } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const callbackSchema = z.discriminatedUnion('status', [
  z.object({
    requestId: z.uuid(),
    operationId: z.uuid(),
    status: z.literal('ready'),
    roundId: z.string().min(1),
  }),
  z.object({
    requestId: z.uuid(),
    operationId: z.uuid(),
    status: z.literal('failed'),
    reason: z.string().min(1).max(500),
    chargeApplied: z.boolean().optional(),
  }),
]);

function authorized(request: Request): boolean {
  if (isWriteRequest(request)) return true;
  const secret = process.env.ALBUM_VARIATION_WEBHOOK_SECRET;
  const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!secret || !token) return false;
  const left = Buffer.from(secret);
  const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = callbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid callback.' }, { status: 400 });
  const input = parsed.data;
  if (input.operationId !== input.requestId)
    return NextResponse.json({ error: 'Operation ID mismatch.' }, { status: 409 });
  const row = await prisma.variationRequest.findUnique({ where: { id: input.requestId } });
  if (row === null) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  if (row.status === 'ready') return NextResponse.json({ status: 'ready' });
  if (row.status === 'failed') return NextResponse.json({ status: 'failed' });
  if (row.status !== 'generating')
    return NextResponse.json({ error: 'Request is not generating.' }, { status: 409 });
  if (input.status === 'failed') {
    const changed = await prisma.variationRequest.updateMany({
      where: { id: input.requestId, status: 'generating' },
      data: {
        status: 'failed',
        dispatchError: input.reason,
        ...(input.chargeApplied === false ? { creditsReserved: 0 } : {}),
      },
    });
    if (changed.count !== 1)
      return NextResponse.json(
        { error: 'Request status changed before callback.' },
        { status: 409 }
      );
    return NextResponse.json({ status: 'failed' });
  }
  if (row.roundId !== input.roundId)
    return NextResponse.json({ error: 'Round does not match this request.' }, { status: 409 });
  const round = await prisma.generationRound.findUnique({ where: { id: input.roundId } });
  const snapshot = round?.snapshot as { variation?: { requestId?: string } } | undefined;
  if (round?.status !== 'ready-to-listen' || snapshot?.variation?.requestId !== input.requestId)
    return NextResponse.json({ error: 'The round is not ready to listen.' }, { status: 409 });
  const changed = await prisma.variationRequest.updateMany({
    where: { id: input.requestId, status: 'generating', roundId: input.roundId },
    data: { status: 'ready', dispatchError: null },
  });
  if (changed.count !== 1)
    return NextResponse.json({ error: 'Request status changed before callback.' }, { status: 409 });
  return NextResponse.json({ status: 'ready' });
}
