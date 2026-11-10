import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { getSet } from '@/lib/album/load-album';
import { OWNER_VISITOR_ID } from '@/lib/owner/auth';
import {
  LISTENER_VOTES_PER_MINUTE,
  LISTENER_VOTES_WINDOW_MS,
  ListenerVoteLimitError,
} from '@/lib/votes/abuse';
import { takeAttempt } from '@/lib/votes/attempt-log';
import { castVote, getVoteSnapshot, safeVoteSnapshot } from '@/lib/votes/board';
import { EMPTY_VOTE_SNAPSHOT, isTakeLabel, type VoteSnapshot } from '@/lib/votes/types';
import { blindSnapshot, realTakeForAlias } from '@/lib/votes/blind';
import { loadSettings } from '@/lib/settings/store';
import { getConsolidatedPassVersion, getVisitorCurrentRound } from '@/lib/votes/pass-store';
import { isBlindForListenerSnapshot, isBlindForSnapshot, markExposed } from '@/lib/votes/exposure';
import { listenerCookieOptions, LISTENER_COOKIE } from '@/lib/votes/listener-id';
import { resolveVoter, type ResolvedVoter } from '@/lib/votes/voter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const voteBodySchema = z.object({
  trackNumber: z.number().int().min(1).max(99),
  versionSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  takeLabel: z.string().refine(isTakeLabel),
  value: z.union([z.literal(1), z.literal(-1)]),
});

function withListenerCookie(response: NextResponse, voter: ResolvedVoter): NextResponse {
  if (voter.kind === 'listener' && voter.issuedCookie !== null) {
    response.cookies.set(LISTENER_COOKIE, voter.issuedCookie, listenerCookieOptions());
  }
  return response;
}

export async function GET(request: Request) {
  const resolved = await resolveVoter(request);
  if ('error' in resolved) {
    return resolved.error;
  }
  if (resolved.voter.kind === 'owner') {
    return ownerSnapshot();
  }
  const snapshot = await listenerSnapshot(resolved.voter.visitorId);
  return withListenerCookie(NextResponse.json(snapshot), resolved.voter);
}

export async function POST(request: Request) {
  const resolved = await resolveVoter(request);
  if ('error' in resolved) {
    return resolved.error;
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

  if (resolved.voter.kind === 'owner') {
    const snapshot = await ownerVote(parsed.data);
    if (snapshot instanceof NextResponse) {
      return snapshot;
    }
    return NextResponse.json(snapshot);
  }

  const allowed = await takeAttempt(
    `vote:${resolved.voter.visitorId}`,
    LISTENER_VOTES_WINDOW_MS,
    LISTENER_VOTES_PER_MINUTE
  );
  if (!allowed) {
    return NextResponse.json({ error: 'Too many votes' }, { status: 429 });
  }

  try {
    const snapshot = await listenerVote(resolved.voter.visitorId, parsed.data);
    if (snapshot instanceof NextResponse) {
      return snapshot;
    }
    return withListenerCookie(NextResponse.json(snapshot), resolved.voter);
  } catch (error) {
    if (error instanceof ListenerVoteLimitError) {
      return NextResponse.json({ error: 'Listener vote limit' }, { status: 429 });
    }
    throw error;
  }
}

async function ownerSnapshot(): Promise<NextResponse> {
  const [snapshot, settings] = await Promise.all([
    safeVoteSnapshot(OWNER_VISITOR_ID),
    loadSettings(),
  ]);
  const blind = await isBlindForSnapshot(OWNER_VISITOR_ID, settings.listeningDetails, snapshot);
  if (!blind) await markExposed(OWNER_VISITOR_ID, snapshot.currentRound);
  return NextResponse.json(blind ? await blindSnapshot(snapshot) : snapshot);
}

async function ownerVote(
  body: z.infer<typeof voteBodySchema>
): Promise<VoteSnapshot | NextResponse> {
  const version = await getSet(body.versionSlug);
  if (version === null) {
    return NextResponse.json({ error: 'Unknown set' }, { status: 404 });
  }

  const track = version.tracks.find(
    item => item.kind === 'album' && item.number === body.trackNumber
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
        alias: body.takeLabel,
        takes: track.takes,
      })
    : track.takes.find(item => item.voteLabel === body.takeLabel || item.label === body.takeLabel);
  if (take === undefined || take === null) {
    return NextResponse.json({ error: 'Unknown take' }, { status: 400 });
  }

  const snapshot = await castVote({
    visitorId: OWNER_VISITOR_ID,
    trackNumber: body.trackNumber,
    versionSlug: take.versionSlug,
    takeLabel: take.voteLabel,
    value: body.value,
  });
  const stillBlind = await isBlindForSnapshot(
    OWNER_VISITOR_ID,
    settings.listeningDetails,
    snapshot
  );
  if (!stillBlind) await markExposed(OWNER_VISITOR_ID, snapshot.currentRound);
  return stillBlind ? await blindSnapshot(snapshot) : snapshot;
}

async function listenerSnapshot(visitorId: string): Promise<VoteSnapshot> {
  const round = await getVisitorCurrentRound(OWNER_VISITOR_ID);
  try {
    const [snapshot, settings, version] = await Promise.all([
      getVoteSnapshot(visitorId, { round, carry: false }),
      loadSettings(),
      getConsolidatedPassVersion(OWNER_VISITOR_ID),
    ]);
    const blind = await isBlindForListenerSnapshot(
      visitorId,
      settings.listeningDetails,
      snapshot,
      version
    );
    if (!blind) await markExposed(visitorId, round);
    return listenerBallot(blind ? await blindSnapshot(snapshot) : snapshot);
  } catch {
    return { ...EMPTY_VOTE_SNAPSHOT, currentRound: round };
  }
}

async function listenerVote(
  visitorId: string,
  body: z.infer<typeof voteBodySchema>
): Promise<VoteSnapshot | NextResponse> {
  const round = await getVisitorCurrentRound(OWNER_VISITOR_ID);
  const pass = await getConsolidatedPassVersion(OWNER_VISITOR_ID);
  const track = pass.tracks.find(item => item.kind === 'album' && item.number === body.trackNumber);
  const takes = [...(track?.takes ?? []), ...(track?.parkedTakes ?? [])].filter(
    take => take.versionSlug === body.versionSlug
  );
  if (track === undefined || takes.length === 0) {
    return NextResponse.json({ error: 'Unknown take' }, { status: 400 });
  }

  const [settings, before] = await Promise.all([
    loadSettings(),
    getVoteSnapshot(visitorId, { round, carry: false }),
  ]);
  const blind = await isBlindForListenerSnapshot(
    visitorId,
    settings.listeningDetails,
    before,
    pass
  );
  if (!blind) await markExposed(visitorId, round);
  const take = blind
    ? await realTakeForAlias({
        round,
        trackNumber: track.number,
        versionSlug: body.versionSlug,
        alias: body.takeLabel,
        takes,
      })
    : (takes.find(item => item.voteLabel === body.takeLabel) ?? null);
  if (take === null) {
    return NextResponse.json({ error: 'Unknown take' }, { status: 400 });
  }

  const snapshot = await castVote({
    visitorId,
    trackNumber: body.trackNumber,
    versionSlug: take.versionSlug,
    takeLabel: take.voteLabel,
    value: body.value,
    round,
  });
  return listenerBallot(blind ? await blindSnapshot(snapshot) : snapshot);
}

function listenerBallot(snapshot: VoteSnapshot): VoteSnapshot {
  return {
    tallies: snapshot.tallies,
    mine: snapshot.mine,
    downloads: snapshot.downloads,
    versionTotals: snapshot.versionTotals,
    currentRound: snapshot.currentRound,
  };
}
