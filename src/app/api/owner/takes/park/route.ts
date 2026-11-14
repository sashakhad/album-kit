import { NextResponse } from 'next/server';
import { z } from 'zod';

import { parseCanonicalTake } from '@/lib/album/parse-filename';
import { requireOwner } from '@/lib/owner/auth';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const parkBodySchema = z.object({
  file: z.string(),
  parked: z.boolean(),
});

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) {
    return denied;
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = parkBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad park' }, { status: 400 });
  }

  const take = parseCanonicalTake(parsed.data.file);
  if (take === null) {
    return NextResponse.json({ error: 'file must be a canonical take filename' }, { status: 400 });
  }

  const key = { versionSlug: take.setId, trackNumber: take.trackNumber, takeLabel: take.letter };
  const db = getPrisma();
  if (parsed.data.parked) {
    await db.parkedTake.upsert({
      where: { versionSlug_trackNumber_takeLabel: key },
      create: key,
      update: {},
    });
  } else {
    await db.parkedTake.deleteMany({ where: key });
  }

  return NextResponse.json({ file: parsed.data.file, parked: parsed.data.parked });
}
