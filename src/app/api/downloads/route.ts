import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { getSet } from '@/lib/album/load-album';
import { OWNER_VISITOR_ID, requireOwner } from '@/lib/owner/auth';
import { getVoteSnapshot } from '@/lib/votes/board';
import { upsertDownload } from '@/lib/votes/pass-store';
import { isTakeLabel } from '@/lib/votes/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const downloadBodySchema = z.object({
  trackNumber: z.number().int().min(1).max(99),
  versionSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  takeLabel: z.string().refine(isTakeLabel),
});

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) {
    return denied;
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = downloadBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad download' }, { status: 400 });
  }

  const config = await loadAlbumConfig();
  if (!config.tracks.some(track => track.number === parsed.data.trackNumber)) {
    return NextResponse.json({ error: 'Unknown track' }, { status: 400 });
  }

  const version = await getSet(parsed.data.versionSlug);
  if (version === null) {
    return NextResponse.json({ error: 'Unknown set' }, { status: 404 });
  }

  const track = version.tracks.find(
    item => item.kind === 'album' && item.number === parsed.data.trackNumber
  );
  if (track === undefined || track.audioUrl === null) {
    return NextResponse.json({ error: 'Track is not ready' }, { status: 400 });
  }

  const take = track.takes.find(item => item.label === parsed.data.takeLabel);
  if (take === undefined) {
    return NextResponse.json({ error: 'Unknown take' }, { status: 400 });
  }

  await upsertDownload({
    visitorId: OWNER_VISITOR_ID,
    trackNumber: parsed.data.trackNumber,
    versionSlug: version.slug,
    takeLabel: take.label,
  });
  return NextResponse.json(await getVoteSnapshot(OWNER_VISITOR_ID));
}
