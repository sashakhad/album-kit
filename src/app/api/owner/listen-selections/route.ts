import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { isOwnerRequest, OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { getPrisma } from '@/lib/prisma';
import { opaqueAudioId } from '@/lib/votes/blind';
import { getConsolidatedPassVersion, getVisitorCurrentRound } from '@/lib/votes/pass-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  trackNumber: z.number().int().min(1).max(99),
  slot: z.enum(['main', 'vip']),
  token: z.string().min(1).nullable(),
  round: z.number().int().min(1),
});

export async function POST(request: Request) {
  if (!(await isOwnerRequest(request))) {
    return NextResponse.json({ error: 'Owner password required' }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid selection' }, { status: 400 });
  }
  const { trackNumber, slot, token, round } = parsed.data;
  const [config, currentRound] = await Promise.all([
    loadAlbumConfig(),
    getVisitorCurrentRound(OWNER_VISITOR_ID),
  ]);
  if (round !== currentRound) {
    return NextResponse.json({ error: 'Round changed. Reload Compare takes.' }, { status: 409 });
  }
  const configTrack = config.tracks.find(track => track.number === trackNumber);
  if (configTrack === undefined || configTrack.parked === true) {
    return NextResponse.json({ error: 'Track is unavailable' }, { status: 404 });
  }

  let setId: string | null = null;
  let takeLabel: string | null = null;
  if (token !== null) {
    const original = await getConsolidatedPassVersion(OWNER_VISITOR_ID);
    const track = original.tracks.find(
      item => item.number === trackNumber && item.kind === 'album'
    );
    const canonical = track?.takes.find(
      take => take.filename === token || opaqueAudioId(round, take.filename) === token
    );
    if (canonical === undefined) {
      return NextResponse.json({ error: 'Take is unavailable in this round' }, { status: 404 });
    }
    setId = canonical.versionSlug;
    takeLabel = canonical.voteLabel;
  }

  await getPrisma().listenSelection.upsert({
    where: { trackNumber_slot: { trackNumber, slot } },
    create: { trackNumber, slot, setId, takeLabel },
    update: { setId, takeLabel },
  });
  return NextResponse.json({ ok: true });
}
