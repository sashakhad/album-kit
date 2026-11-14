import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveClipStreams } from '@/lib/album/clip-stream';
import { refreshStoredStreams } from '@/lib/album/stream-url';
import { requireOwner } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  clips: z
    .array(
      z.object({
        id: z.string().min(1),
        audio_url: z.string().min(1).nullish(),
      })
    )
    .max(500),
});

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const raw: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const rows = await prisma.takeProvenance.findMany({
    select: { filename: true, clipId: true, outputId: true, streamUrl: true },
  });
  const resolved = await resolveClipStreams(parsed.data.clips);
  const updates = refreshStoredStreams(rows, resolved.clips);
  const byFilename = new Map(rows.map(row => [row.filename, row]));
  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map(update => {
        const existing = byFilename.get(update.filename);
        return prisma.takeProvenance.update({
          where: { filename: update.filename },
          data: {
            clipId: update.clipId,
            streamUrl: update.streamUrl,
            ...(existing === undefined || existing.outputId === null
              ? { outputId: update.clipId }
              : {}),
          },
        });
      })
    );
  }
  return NextResponse.json({
    updated: updates,
    unchanged: rows.length - updates.length,
    problems: resolved.problems,
  });
}
