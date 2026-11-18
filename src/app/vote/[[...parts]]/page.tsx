import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AlbumPlayer, type VariationTrackStatus } from '@/components/album/AlbumPlayer';
import { MergeBallotPrompt } from '@/components/album/MergeBallotOffer';
import { RoundProgressBanner } from '@/components/album/RoundProgressBanner';
import { TakeAvailability } from '@/components/album/TakeAvailability';
import type { ListenChoice } from '@/components/album/ListenChoiceControls';
import { getListenConfig } from '@/lib/album/listen-store';
import { findTakeByVersionAndLabel } from '@/lib/album/playback';
import { parseTakeSegment, resolveTrack } from '@/lib/album/play-path';
import type { AlbumTrack, AlbumVersion } from '@/lib/album/types';
import { type VoteSnapshot } from '@/lib/votes/types';
import { isOwner } from '@/lib/owner/auth';
import { loadVariationTrackStatus } from '@/lib/variations/status';
import { loadSettings } from '@/lib/settings/store';
import { listenerJudgingView } from '@/lib/votes/listener-view';
import { ownerJudgingView } from '@/lib/votes/owner-view';
import { opaqueAudioId } from '@/lib/votes/blind';
import { countBrowserListenerVotes } from '@/lib/votes/merge-ballot';
import { loadAlbumProgress } from '@/lib/rounds/load-progress';
import { emptyTakeMessage, pendingTakeLabel, progressBannerLine } from '@/lib/rounds/progress';
import type { AlbumProgress } from '@/lib/rounds/progress';

export const dynamic = 'force-dynamic';

type VotePageProps = {
  params: Promise<{ parts?: string[] }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const progress = await loadAlbumProgress().catch(() => null);
  const round = progress?.roundNumber;
  return { title: round === null || round === undefined ? 'Compare takes' : `Round ${round}` };
}

export default async function VotePage({ params }: VotePageProps) {
  const { parts = [] } = await params;
  const progress = await loadAlbumProgress();
  const bannerLine = progressBannerLine(progress);
  if (parts.length === 2 || parts.length > 3) {
    notFound();
  }

  const [trackSlug, versionSlug, takeSlug] = parts;
  const [config, owner] = await Promise.all([getListenConfig(), isOwner()]);
  if (!owner) {
    const listener = await listenerJudgingView(await loadSettings());
    return (
      <VoteMain
        version={listener.version}
        votes={listener.votes}
        voter='listener'
        awaitingReveal={listener.awaitingReveal}
        blindLabels={listener.blind}
        track={trackFromParts(trackSlug, config, listener.version)}
        initialTake={takeFromParts(trackSlug, versionSlug, takeSlug, config, listener.version)}
        bannerLine={bannerLine}
        progress={progress}
        roundNumber={progress.roundNumber}
      />
    );
  }
  const [
    { version, originalVersion, votes, blind, awaitingReveal, passSummary },
    listenerVotesOnBrowser,
    variationStatusByTrack,
  ] = await Promise.all([
    ownerJudgingView(),
    countBrowserListenerVotes(),
    loadVariationTrackStatus(),
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
      blindLabels={blind}
      track={track}
      initialTake={initialTake}
      showListenerScores
      listenerVotesOnBrowser={listenerVotesOnBrowser}
      listenChoices={listenChoices}
      passSummary={passSummary}
      canRequestVariations={owner}
      {...(blind ? { variationBlindRound: votes.currentRound } : {})}
      variationStatusByTrack={variationStatusByTrack}
      bannerLine={bannerLine}
      progress={progress}
      roundNumber={progress.roundNumber}
    />
  );
}

function VoteMain({
  version,
  votes,
  voter,
  awaitingReveal,
  blindLabels = false,
  track,
  initialTake,
  listenerVotesOnBrowser = 0,
  showListenerScores = false,
  listenChoices,
  passSummary,
  canRequestVariations = false,
  variationBlindRound,
  variationStatusByTrack,
  bannerLine = null,
  progress,
  roundNumber = null,
}: {
  version: AlbumVersion;
  votes: VoteSnapshot;
  voter: 'owner' | 'listener';
  awaitingReveal: boolean;
  blindLabels?: boolean;
  track: AlbumTrack | null;
  initialTake: { label: string } | null;
  listenerVotesOnBrowser?: number;
  showListenerScores?: boolean;
  listenChoices?: Record<number, ListenChoice>;
  passSummary?: { total: number; remaining: number; parked: number; dropped: number };
  canRequestVariations?: boolean;
  variationBlindRound?: number;
  variationStatusByTrack?: Record<number, VariationTrackStatus>;
  bannerLine?: string | null;
  progress: AlbumProgress;
  roundNumber?: number | null;
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
            {`Round ${roundNumber ?? votes.currentRound}`}
          </span>
          <span className='ml-2'>
            {voter === 'owner'
              ? 'Your highest positive scores play on Listen, including ties.'
              : 'Tap + or − to score a take.'}
          </span>
        </p>
        <Link
          href='/listen'
          className='text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-sm underline underline-offset-4'
        >
          Open Listen
        </Link>
      </div>
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
          blindLabels={blindLabels}
          showListenerScores={showListenerScores}
          {...(listenChoices === undefined ? {} : { listenChoices })}
          {...(passSummary === undefined ? {} : { passSummary })}
          canRequestVariations={canRequestVariations}
          {...(variationBlindRound === undefined ? {} : { variationBlindRound })}
          {...(variationStatusByTrack === undefined ? {} : { variationStatusByTrack })}
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

function trackByNumber(version: AlbumVersion, number: number): AlbumTrack | null {
  return version.tracks.find(track => track.number === number) ?? null;
}

function trackFromParts(
  trackSlug: string | undefined,
  config: { tracks: ReadonlyArray<{ slug: string; number: number }> },
  version: AlbumVersion
): AlbumTrack | null {
  const configTrack = config.tracks.find(track => track.slug === trackSlug);
  if (trackSlug === undefined) return null;
  if (configTrack === undefined) return resolveTrack(trackSlug, version.tracks);
  return trackByNumber(version, configTrack.number);
}

function takeFromParts(
  trackSlug: string | undefined,
  versionSlug: string | undefined,
  takeSlug: string | undefined,
  config: { tracks: ReadonlyArray<{ slug: string; number: number }> },
  version: AlbumVersion
): { label: string } | null {
  const track = trackFromParts(trackSlug, config, version);
  const voteLabel = parseTakeSegment(takeSlug);
  if (track === null || versionSlug === undefined || voteLabel === null) return null;
  return findTakeByVersionAndLabel(track, versionSlug, voteLabel);
}
