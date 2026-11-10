import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { AlbumPlayer } from '@/components/album/AlbumPlayer';
import { loadAlbumConfig } from '@/lib/album/album-config';
import { findTakeByVersionAndLabel } from '@/lib/album/playback';
import { parseTakeSegment, resolveTrack, voteHref } from '@/lib/album/play-path';
import type { AlbumTrack, AlbumVersion } from '@/lib/album/types';
import { isOwner, OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { safeVoteSnapshot } from '@/lib/votes/board';
import { getConsolidatedPassVersion, getVisitorCurrentRound } from '@/lib/votes/pass-store';
import { blindSnapshot, blindVersion } from '@/lib/votes/blind';
import { loadSettings } from '@/lib/settings/store';
import { withVisibleDetails } from '@/lib/votes/provenance';
import { allTakesVoted, markExposed, wasExposed } from '@/lib/votes/exposure';

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
  if (!(await isOwner())) {
    redirect(`/key?next=${encodeURIComponent(votePath(parts))}`);
  }
  if (parts.length === 2 || parts.length > 3) {
    notFound();
  }

  const [trackSlug, versionSlug, takeSlug] = parts;
  const [config, originalVersion, originalVotes, settings] = await Promise.all([
    loadAlbumConfig(),
    getConsolidatedPassVersion(OWNER_VISITOR_ID),
    safeVoteSnapshot(OWNER_VISITOR_ID),
    loadSettings(),
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
    <main className='mx-auto max-w-5xl px-6 py-12'>
      {track === null ? (
        <AlbumPlayer
          version={version}
          votes={votes}
          surface='vote'
          awaitingReveal={settings.listeningDetails === 'reveal-after-vote' && blind}
        />
      ) : initialTake === null ? (
        <AlbumPlayer
          version={version}
          votes={votes}
          surface='vote'
          awaitingReveal={settings.listeningDetails === 'reveal-after-vote' && blind}
          initialTrackNumber={track.number}
          initialTrackTitle={track.title}
        />
      ) : (
        <AlbumPlayer
          version={version}
          votes={votes}
          surface='vote'
          awaitingReveal={settings.listeningDetails === 'reveal-after-vote' && blind}
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
