import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { getSet } from '@/lib/album/load-album';
import { parseCanonicalTake } from '@/lib/album/parse-filename';
import { requireOwner } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  id: z.uuid(),
  trackNumber: z.number().int().min(1).max(99),
  parentTakeFilename: z.string(),
  requestedTakes: z.number().int().min(1).max(20),
  instructions: z.string().trim().max(1000).default(''),
});

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const id = new URL(request.url).searchParams.get('id');
  if (id !== null) {
    if (!z.uuid().safeParse(id).success)
      return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 });
    const found = await prisma.variationRequest.findUnique({ where: { id } });
    return found === null
      ? NextResponse.json({ error: 'Request not found' }, { status: 404 })
      : NextResponse.json(found);
  }
  const requests = await prisma.variationRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json(requests);
}

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const raw: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Choose 1–20 takes and a valid parent take' },
      { status: 400 }
    );

  const input = parsed.data;
  const existing = await prisma.variationRequest.findUnique({ where: { id: input.id } });
  if (existing !== null) {
    if (existing.status === 'canceled')
      return NextResponse.json({ error: 'This request was canceled' }, { status: 409 });
    const same =
      existing.trackNumber === input.trackNumber &&
      existing.parentTakeFilename === input.parentTakeFilename &&
      existing.requestedTakes === input.requestedTakes &&
      existing.instructions === input.instructions;
    return same
      ? NextResponse.json(existing)
      : NextResponse.json(
          { error: 'Request ID already belongs to another variation' },
          { status: 409 }
        );
  }

  const parent = parseCanonicalTake(input.parentTakeFilename);
  if (parent === null || parent.trackNumber !== input.trackNumber)
    return NextResponse.json(
      { error: 'Parent take does not match the selected track' },
      { status: 400 }
    );

  const [album, set] = await Promise.all([loadAlbumConfig(), getSet(parent.setId)]);
  const track = album.tracks.find(item => item.number === input.trackNumber);
  if (
    track === undefined ||
    track.slug !== parent.slug ||
    set?.tracks
      .find(item => item.number === input.trackNumber)
      ?.takes.some(take => take.filename === input.parentTakeFilename) !== true
  ) {
    return NextResponse.json(
      { error: 'Selected take is not available for this track' },
      { status: 404 }
    );
  }

  const created = await prisma.variationRequest.upsert({
    where: { id: input.id },
    create: input,
    update: {},
  });
  if (
    created.status === 'canceled' ||
    created.trackNumber !== input.trackNumber ||
    created.parentTakeFilename !== input.parentTakeFilename ||
    created.requestedTakes !== input.requestedTakes ||
    created.instructions !== input.instructions
  ) {
    return NextResponse.json(
      { error: 'Request ID already belongs to another variation' },
      { status: 409 }
    );
  }
  return NextResponse.json(
    {
      request: created,
      next: 'The bot must write the revised prompt, check current Suno credits and downloads, and show an exact estimate for your approval before generation.',
    },
    { status: 201 }
  );
}

/** A canceled ID is kept as a tombstone so a delayed retry cannot create it later. */
export async function DELETE(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const raw: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid variation request' }, { status: 400 });
  const input = parsed.data;
  const row = await prisma.variationRequest.upsert({
    where: { id: input.id },
    create: { ...input, status: 'canceled' },
    update: {},
  });
  if (
    row.trackNumber !== input.trackNumber ||
    row.parentTakeFilename !== input.parentTakeFilename ||
    row.requestedTakes !== input.requestedTakes ||
    row.instructions !== input.instructions
  )
    return NextResponse.json({ error: 'Request ID belongs to another variation' }, { status: 409 });
  if (row.status === 'canceled') return NextResponse.json(row);
  const changed = await prisma.variationRequest.updateMany({
    where: { id: input.id, status: 'requested', roundId: null },
    data: { status: 'canceled' },
  });
  if (changed.count === 0)
    return NextResponse.json(
      { error: 'This request is already planned and cannot be changed here' },
      { status: 409 }
    );
  return NextResponse.json({ ...row, status: 'canceled' });
}
