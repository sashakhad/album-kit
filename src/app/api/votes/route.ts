import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { getSet } from '@/lib/album/load-album';
import { OWNER_VISITOR_ID, requireOwner } from '@/lib/owner/auth';
import { castVote, safeVoteSnapshot } from '@/lib/votes/board';
import { isTakeLabel } from '@/lib/votes/types';
import { blindSnapshot, realTakeForAlias } from '@/lib/votes/blind';
import { loadSettings } from '@/lib/settings/store';
import { getVisitorCurrentRound } from '@/lib/votes/pass-store';
import { isBlindForSnapshot, markExposed } from '@/lib/votes/exposure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const voteBodySchema = z.object({
  trackNumber: z.number().int().min(1).max(99),
  versionSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  takeLabel: z.string().refine(isTakeLabel),
  value: z.union([z.literal(1), z.literal(-1)]),
});

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) {
    return denied;
  }

  const [snapshot, settings] = await Promise.all([
    safeVoteSnapshot(OWNER_VISITOR_ID),
    loadSettings(),
  ]);
  const blind = await isBlindForSnapshot(OWNER_VISITOR_ID, settings.listeningDetails, snapshot);
  if (!blind) await markExposed(OWNER_VISITOR_ID, snapshot.currentRound);
  return NextResponse.json(blind ? await blindSnapshot(snapshot) : snapshot);
}

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) {
    return denied;
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = voteBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad vote' }, { status: 400 });
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

  const settings = await loadSettings();
  const before = await safeVoteSnapshot(OWNER_VISITOR_ID);
  const blind = await isBlindForSnapshot(OWNER_VISITOR_ID, settings.listeningDetails, before);
  if (!blind) await markExposed(OWNER_VISITOR_ID, before.currentRound);
  const take = blind
    ? await realTakeForAlias({
        round: await getVisitorCurrentRound(OWNER_VISITOR_ID),
        trackNumber: track.number,
        versionSlug: version.slug,
        alias: parsed.data.takeLabel,
        takes: track.takes,
      })
    : track.takes.find(
        item => item.voteLabel === parsed.data.takeLabel || item.label === parsed.data.takeLabel
      );
  if (take === undefined || take === null) {
    return NextResponse.json({ error: 'Unknown take' }, { status: 400 });
  }

  const snapshot = await castVote({
    visitorId: OWNER_VISITOR_ID,
    trackNumber: parsed.data.trackNumber,
    versionSlug: take.versionSlug,
    takeLabel: take.voteLabel,
    value: parsed.data.value,
  });
  const stillBlind = await isBlindForSnapshot(
    OWNER_VISITOR_ID,
    settings.listeningDetails,
    snapshot
  );
  if (!stillBlind) await markExposed(OWNER_VISITOR_ID, snapshot.currentRound);
  return NextResponse.json(stillBlind ? await blindSnapshot(snapshot) : snapshot);
}
