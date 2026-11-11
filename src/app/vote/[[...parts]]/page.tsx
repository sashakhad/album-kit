import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AlbumPlayer } from '@/components/album/AlbumPlayer';
import { loadAlbumConfig } from '@/lib/album/album-config';
import { findTakeByVersionAndLabel } from '@/lib/album/playback';
import { parseTakeSegment, resolveTrack, voteHref } from '@/lib/album/play-path';
import type { AlbumTrack, AlbumVersion } from '@/lib/album/types';
import { isOwner, OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { isViewer } from '@/lib/owner/viewer';
import { canCastVote } from '@/lib/settings/access';
import { getVisitorCurrentRound } from '@/lib/votes/pass-store';
import { loadSettings } from '@/lib/settings/store';
import { type VoteSnapshot } from '@/lib/votes/types';
import { ownerJudgingView } from '@/lib/votes/owner-view';
import { listenerJudgingView } from '@/lib/votes/listener-view';

export const dynamic = 'force-dynamic';

type VotePageProps = {
  params: Promise<{ parts?: string[] }>;
};

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isOwner())) {
    return { title: 'Compare takes' };
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
      listeningDetails: settings.listeningDetails,
    });
  }
  const [config, { version, votes, awaitingReveal }] = await Promise.all([
    loadAlbumConfig(),
    ownerJudgingView(),
  ]);
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
      awaitingReveal={awaitingReveal}
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
  listeningDetails: 'visible' | 'reveal-after-vote' | 'keep-hidden';
}) {
  const [config, { version, votes, awaitingReveal }] = await Promise.all([
    loadAlbumConfig(),
    listenerJudgingView(args),
  ]);
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
      awaitingReveal={awaitingReveal}
      track={track}
      initialTake={initialTake}
      note='Play a take, then tap + or − to score it.'
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
    <main className='mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10'>
      {note === null ? null : (
        <p className='text-muted-foreground mb-5 max-w-2xl text-sm'>{note}</p>
      )}
      {voter === 'listener' ? (
        <Link
          href='/key?next=/vote'
          className='text-muted-foreground mb-5 inline-flex min-h-11 items-center text-sm underline underline-offset-4'
        >
          Owner sign-in
        </Link>
      ) : null}
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
