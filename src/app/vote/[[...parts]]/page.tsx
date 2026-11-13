import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AlbumPlayer } from '@/components/album/AlbumPlayer';
import { RoundProgressBanner } from '@/components/album/RoundProgressBanner';
import type { ListenChoice } from '@/components/album/ListenChoiceControls';
import { loadAlbumConfig } from '@/lib/album/album-config';
import { getListenConfig } from '@/lib/album/listen-store';
import { findTakeByVersionAndLabel } from '@/lib/album/playback';
import { parseTakeSegment, resolveTrack, voteHref } from '@/lib/album/play-path';
import type { AlbumTrack, AlbumVersion } from '@/lib/album/types';
import { isOwner, OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { isViewer } from '@/lib/owner/viewer';
import { canCastVote } from '@/lib/settings/access';
import { getVisitorCurrentRound } from '@/lib/votes/pass-store';
import { opaqueAudioId } from '@/lib/votes/blind';
import { loadSettings } from '@/lib/settings/store';
import { type VoteSnapshot } from '@/lib/votes/types';
import { ownerJudgingView } from '@/lib/votes/owner-view';
import { listenerJudgingView } from '@/lib/votes/listener-view';
import { loadAlbumProgress } from '@/lib/rounds/load-progress';
import { progressBannerLine } from '@/lib/rounds/progress';

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
  const [owner, settings, viewer, progress] = await Promise.all([
    isOwner(),
    loadSettings(),
    isViewer(),
    loadAlbumProgress(),
  ]);
  const bannerLine = progressBannerLine(progress);
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
      signInHref: `/key?next=${encodeURIComponent(votePath(parts))}`,
      visibility: settings.visibility,
      listeningDetails: settings.listeningDetails,
      bannerLine,
    });
  }
  const [config, { version, originalVersion, votes, blind, awaitingReveal }] = await Promise.all([
    getListenConfig(),
    ownerJudgingView(),
  ]);
  const listenChoices: Record<number, ListenChoice> = Object.fromEntries(
    config.tracks.map(item => {
      const original = trackByNumber(originalVersion, item.number);
      const take = original?.takes.find(
        take => take.versionSlug === item.listen?.set && take.voteLabel === item.listen.take
      );
      const token =
        take === undefined
          ? null
          : blind
            ? opaqueAudioId(votes.currentRound, take.filename)
            : take.filename;
      return [
        item.number,
        { manual: item.listen !== undefined, token, hasBonus: item.vip !== undefined },
      ];
    })
  );
  const savedOutsideRound: AlbumTrack[] = config.tracks
    .filter(
      item =>
        !item.parked &&
        (item.listen !== undefined || item.vip !== undefined) &&
        trackByNumber(version, item.number) === null
    )
    .map(item => ({
      number: item.number,
      title: item.title,
      kind: 'album',
      filename: null,
      audioUrl: null,
      takes: [],
      prompt: null,
    }));
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
      version={{
        ...version,
        tracks: [...version.tracks, ...savedOutsideRound].sort((a, b) => a.number - b.number),
      }}
      votes={votes}
      voter='owner'
      awaitingReveal={awaitingReveal}
      track={track}
      initialTake={initialTake}
      showListenerScores={settings.listenerVoting}
      listenChoices={listenChoices}
      bannerLine={bannerLine}
    />
  );
}

async function listenerVotePage(args: {
  trackSlug: string | undefined;
  versionSlug: string | undefined;
  takeSlug: string | undefined;
  signInHref: string;
  visibility: 'unset' | 'public' | 'private';
  listeningDetails: 'visible' | 'reveal-after-vote' | 'keep-hidden';
  bannerLine: string | null;
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
      signInHref={args.signInHref}
      bannerLine={args.bannerLine}
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
  signInHref,
  showListenerScores = false,
  listenChoices,
  bannerLine = null,
}: {
  version: AlbumVersion;
  votes: VoteSnapshot;
  voter: 'owner' | 'listener';
  awaitingReveal: boolean;
  track: AlbumTrack | null;
  initialTake: { label: string } | null;
  signInHref?: string;
  showListenerScores?: boolean;
  listenChoices?: Record<number, ListenChoice>;
  bannerLine?: string | null;
}) {
  return (
    <main className='mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8'>
      <RoundProgressBanner line={bannerLine} />
      <div className='mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-white/10 pb-2'>
        <p className='text-muted-foreground text-sm'>
          <span className='text-foreground font-medium'>
            {voter === 'owner' ? `Owner · Round ${votes.currentRound}` : 'Listener ballot'}
          </span>
          <span className='ml-2'>
            {voter === 'owner'
              ? 'Your highest positive scores play on Listen, including ties.'
              : 'Tap + or − to score a take.'}
          </span>
        </p>
        <Link
          href={signInHref ?? '/listen'}
          className='text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-sm underline underline-offset-4'
        >
          {voter === 'owner' ? 'Open Listen' : 'Sign in as owner'}
        </Link>
      </div>
      <AlbumPlayer
        key={`${voter}-${votes.currentRound}`}
        version={version}
        votes={votes}
        surface='vote'
        voter={voter}
        awaitingReveal={awaitingReveal}
        showListenerScores={showListenerScores}
        {...(listenChoices === undefined ? {} : { listenChoices })}
        {...(track === null
          ? {}
          : { initialTrackNumber: track.number, initialTrackTitle: track.title })}
        {...(initialTake === null ? {} : { initialTakeLabel: initialTake.label })}
      />
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
