import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { AlbumPlayer } from '@/components/album/AlbumPlayer';
import { loadAlbumConfig } from '@/lib/album/album-config';
import { findTakeByVersionAndLabel } from '@/lib/album/playback';
import { parseTakeSegment, resolveTrack, voteHref } from '@/lib/album/play-path';
import type { AlbumTrack, AlbumVersion } from '@/lib/album/types';
import { isOwner, OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { isViewer, viewerInviteId } from '@/lib/owner/viewer';
import { canCastVote } from '@/lib/settings/access';
import { getVoteSnapshot, safeVoteSnapshot } from '@/lib/votes/board';
import { getConsolidatedPassVersion, getVisitorCurrentRound } from '@/lib/votes/pass-store';
import { blindSnapshot, blindVersion } from '@/lib/votes/blind';
import { loadSettings } from '@/lib/settings/store';
import { withVisibleDetails } from '@/lib/votes/provenance';
import { allTakesVoted, markExposed, wasExposed } from '@/lib/votes/exposure';
import { EMPTY_VOTE_SNAPSHOT, type VoteSnapshot } from '@/lib/votes/types';
import {
  inviteListenerVisitorId,
  listenerIdFromPage,
  publicListenerVisitorId,
} from '@/lib/votes/listener-id';

export const dynamic = 'force-dynamic';

type VotePageProps = {
  params: Promise<{ parts?: string[] }>;
};

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isOwner())) {
    return { title: 'Vote' };
  }
  const round = await getVisitorCurrentRound(OWNER_VISITOR_ID).catch(() => 1);
  return { title: `Round ${round}` };
}

export default async function VotePage({ params }: VotePageProps) {
  const { parts = [] } = await params;
  const [owner, settings, viewer] = await Promise.all([isOwner(), loadSettings(), isViewer()]);
  if (
    !canCastVote({
      visibility: settings.visibility,
      listenerVoting: settings.listenerVoting,
      owner,
      viewer,
    })
  ) {
    redirect(`/key?next=${encodeURIComponent(votePath(parts))}`);
  }
  if (parts.length === 2 || parts.length > 3) {
    notFound();
  }

  const [trackSlug, versionSlug, takeSlug] = parts;
  if (!owner) {
    return listenerVotePage({
      trackSlug,
      versionSlug,
      takeSlug,
      visibility: settings.visibility,
    });
  }
  const [config, originalVersion, originalVotes] = await Promise.all([
    loadAlbumConfig(),
    getConsolidatedPassVersion(OWNER_VISITOR_ID),
    safeVoteSnapshot(OWNER_VISITOR_ID),
  ]);
  const revealReady =
    settings.listeningDetails === 'reveal-after-vote' &&
    allTakesVoted(originalVersion, originalVotes);
  const exposedBefore = await wasExposed(OWNER_VISITOR_ID, originalVotes.currentRound);
  const blind =
    settings.listeningDetails === 'keep-hidden' ||
    (settings.listeningDetails === 'reveal-after-vote' && !revealReady && !exposedBefore);
  if (!blind) await markExposed(OWNER_VISITOR_ID, originalVotes.currentRound);
  const version = blind
    ? await blindVersion(originalVersion, originalVotes.currentRound)
    : await withVisibleDetails(originalVersion);
  const votes = blind ? await blindSnapshot(originalVotes) : originalVotes;
  const configTrack = config.tracks.find(track => track.slug === trackSlug);
  const track =
    trackSlug === undefined
      ? null
      : configTrack === undefined
        ? resolveTrack(trackSlug, version.tracks)
        : trackByNumber(version, configTrack.number);
  const voteLabel = parseTakeSegment(takeSlug);
  const initialTake =
    track === null || versionSlug === undefined || voteLabel === null
      ? null
      : findTakeByVersionAndLabel(track, versionSlug, voteLabel);

  return (
    <VoteMain
      version={version}
      votes={votes}
      voter='owner'
      awaitingReveal={settings.listeningDetails === 'reveal-after-vote' && blind}
      track={track}
      initialTake={initialTake}
      note={
        settings.listenerVoting
          ? 'Listener scores, when other people have voted, appear beside yours. They stay off your picks, and only you start the next round.'
          : null
      }
    />
  );
}

async function listenerVotePage(args: {
  trackSlug: string | undefined;
  versionSlug: string | undefined;
  takeSlug: string | undefined;
  visibility: 'unset' | 'public' | 'private';
}) {
  const [config, originalVersion, ownerRound, inviteId, publicId] = await Promise.all([
    loadAlbumConfig(),
    getConsolidatedPassVersion(OWNER_VISITOR_ID),
    getVisitorCurrentRound(OWNER_VISITOR_ID),
    args.visibility === 'private' ? viewerInviteId() : Promise.resolve(null),
    listenerIdFromPage(),
  ]);
  const visitorId =
    inviteId !== null
      ? inviteListenerVisitorId(inviteId)
      : publicId !== null
        ? publicListenerVisitorId(publicId)
        : '';
  const originalVotes =
    visitorId.length === 0
      ? { ...EMPTY_VOTE_SNAPSHOT, currentRound: ownerRound }
      : await getVoteSnapshot(visitorId, { round: ownerRound, carry: false }).catch(
          (): VoteSnapshot => ({ ...EMPTY_VOTE_SNAPSHOT, currentRound: ownerRound })
        );
  const version = await blindVersion(originalVersion, ownerRound);
  const votes = await blindSnapshot({ ...originalVotes, currentRound: ownerRound });
  const configTrack = config.tracks.find(track => track.slug === args.trackSlug);
  const track =
    args.trackSlug === undefined
      ? null
      : configTrack === undefined
        ? resolveTrack(args.trackSlug, version.tracks)
        : trackByNumber(version, configTrack.number);
  const voteLabel = parseTakeSegment(args.takeSlug);
  const initialTake =
    track === null || args.versionSlug === undefined || voteLabel === null
      ? null
      : findTakeByVersionAndLabel(track, args.versionSlug, voteLabel);

  return (
    <VoteMain
      version={version}
      votes={votes}
      voter='listener'
      awaitingReveal={false}
      track={track}
      initialTake={initialTake}
      note='You are voting as a listener. Your scores stay on your own ballot. The owner chooses what gets pinned.'
    />
  );
}

function VoteMain({
  version,
  votes,
  voter,
  awaitingReveal,
  track,
  initialTake,
  note,
}: {
  version: AlbumVersion;
  votes: VoteSnapshot;
  voter: 'owner' | 'listener';
  awaitingReveal: boolean;
  track: AlbumTrack | null;
  initialTake: { label: string } | null;
  note: string | null;
}) {
  return (
    <main className='mx-auto max-w-5xl px-6 py-12'>
      {note === null ? null : (
        <p className='text-muted-foreground mb-8 max-w-2xl text-sm'>{note}</p>
      )}
      {track === null ? (
        <AlbumPlayer
          version={version}
          votes={votes}
          surface='vote'
          voter={voter}
          awaitingReveal={awaitingReveal}
        />
      ) : initialTake === null ? (
        <AlbumPlayer
          version={version}
          votes={votes}
          surface='vote'
          voter={voter}
          awaitingReveal={awaitingReveal}
          initialTrackNumber={track.number}
          initialTrackTitle={track.title}
        />
      ) : (
        <AlbumPlayer
          version={version}
          votes={votes}
          surface='vote'
          voter={voter}
          awaitingReveal={awaitingReveal}
          initialTrackNumber={track.number}
          initialTrackTitle={track.title}
          initialTakeLabel={initialTake.label}
        />
      )}
    </main>
  );
}

function votePath(parts: readonly string[]): string {
  const base = voteHref();
  if (parts.length === 0) {
    return base;
  }
  return `${base}/${parts.map(part => encodeURIComponent(part)).join('/')}`;
}

function trackByNumber(version: AlbumVersion, number: number): AlbumTrack | null {
  return version.tracks.find(track => track.number === number) ?? null;
}
