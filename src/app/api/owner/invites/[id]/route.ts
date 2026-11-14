import { NextResponse } from 'next/server';

import { requireOwner } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const { id } = await context.params;
  const result = await prisma.accessInvite.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0)
    return NextResponse.json({ error: 'Unknown or revoked invite' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
