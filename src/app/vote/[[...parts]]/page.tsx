import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AlbumPlayer } from '@/components/album/AlbumPlayer';
import { ListenerOwnerClaim } from '@/components/album/ListenerOwnerClaim';
import { MergeBallotPrompt } from '@/components/album/MergeBallotOffer';
import { RoundProgressBanner } from '@/components/album/RoundProgressBanner';
import { TakeAvailability } from '@/components/album/TakeAvailability';
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
import { countBrowserListenerVotes } from '@/lib/votes/merge-ballot';
import { loadAlbumProgress } from '@/lib/rounds/load-progress';
import { emptyTakeMessage, pendingTakeLabel, progressBannerLine } from '@/lib/rounds/progress';
import type { AlbumProgress } from '@/lib/rounds/progress';

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
      returnPath: votePath(parts),
      visibility: settings.visibility,
      listeningDetails: settings.listeningDetails,
      maskPromptModels: settings.maskPromptModels,
      bannerLine,
      progress,
    });
  }
  const [
    config,
    { version, originalVersion, votes, blind, awaitingReveal, passSummary },
    listenerVotesOnBrowser,
  ] = await Promise.all([getListenConfig(), ownerJudgingView(), countBrowserListenerVotes()]);
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
      showListenerScores
      listenerVotesOnBrowser={listenerVotesOnBrowser}
      listenChoices={listenChoices}
      passSummary={passSummary}
      canRequestVariations
      {...(blind ? { variationBlindRound: votes.currentRound } : {})}
      bannerLine={bannerLine}
      progress={progress}
    />
  );
}

async function listenerVotePage(args: {
  trackSlug: string | undefined;
  versionSlug: string | undefined;
  takeSlug: string | undefined;
  signInHref: string;
  returnPath: string;
  visibility: 'unset' | 'public' | 'private';
  listeningDetails: 'visible' | 'reveal-after-vote' | 'keep-hidden';
  maskPromptModels: boolean;
  bannerLine: string | null;
  progress: AlbumProgress;
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
      returnPath={args.returnPath}
      privateAlbum={args.visibility === 'private'}
      bannerLine={args.bannerLine}
      progress={args.progress}
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
  returnPath,
  privateAlbum = false,
  listenerVotesOnBrowser = 0,
  showListenerScores = false,
  listenChoices,
  passSummary,
  canRequestVariations = false,
  variationBlindRound,
  bannerLine = null,
  progress,
}: {
  version: AlbumVersion;
  votes: VoteSnapshot;
  voter: 'owner' | 'listener';
  awaitingReveal: boolean;
  track: AlbumTrack | null;
  initialTake: { label: string } | null;
  signInHref?: string;
  returnPath?: string;
  privateAlbum?: boolean;
  listenerVotesOnBrowser?: number;
  showListenerScores?: boolean;
  listenChoices?: Record<number, ListenChoice>;
  passSummary?: { total: number; remaining: number; parked: number; dropped: number };
  canRequestVariations?: boolean;
  variationBlindRound?: number;
  bannerLine?: string | null;
  progress: AlbumProgress;
}) {
  const playable = version.tracks.some(item => item.audioUrl !== null);
  const notice = playable ? undefined : emptyTakeMessage(progress);
  const pending = pendingTakeLabel(progress);
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
      {voter === 'listener' && privateAlbum && returnPath !== undefined ? (
        <ListenerOwnerClaim next={returnPath} />
      ) : null}
      {voter === 'owner' && listenerVotesOnBrowser > 0 ? (
        <MergeBallotPrompt votes={listenerVotesOnBrowser} />
      ) : null}
      {!playable && version.tracks.length === 0 ? (
        <TakeAvailability
          message={notice ?? pending}
          tracks={progress.tracks}
          pendingLabel={pending}
        />
      ) : (
        <AlbumPlayer
          key={`${voter}-${votes.currentRound}`}
          version={version}
          votes={votes}
          surface='vote'
          voter={voter}
          awaitingReveal={awaitingReveal}
          showListenerScores={showListenerScores}
          {...(listenChoices === undefined ? {} : { listenChoices })}
          {...(passSummary === undefined ? {} : { passSummary })}
          canRequestVariations={canRequestVariations}
          {...(variationBlindRound === undefined ? {} : { variationBlindRound })}
          {...(notice === undefined ? {} : { emptyNotice: notice, pendingLabel: pending })}
          {...(track === null
            ? {}
            : { initialTrackNumber: track.number, initialTrackTitle: track.title })}
          {...(initialTake === null ? {} : { initialTakeLabel: initialTake.label })}
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
