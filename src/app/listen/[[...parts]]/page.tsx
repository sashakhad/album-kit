import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AlbumPlayer } from '@/components/album/AlbumPlayer';
import { RoundProgressBanner } from '@/components/album/RoundProgressBanner';
import { TakeAvailability } from '@/components/album/TakeAvailability';
import { buildListeningQueue, findListenTrack } from '@/lib/album/listen';
import { getListenConfig, getListenVersion, withPublishedPlayback } from '@/lib/album/listen-store';
import { isOwner } from '@/lib/owner/auth';
import { loadSettings } from '@/lib/settings/store';
import { canCastVote, canViewAlbum } from '@/lib/settings/access';
import { isViewer } from '@/lib/owner/viewer';
import { ownerJudgingView } from '@/lib/votes/owner-view';
import { listenerJudgingView } from '@/lib/votes/listener-view';
import { withVisibleDetails } from '@/lib/votes/provenance';
import { loadAlbumProgress } from '@/lib/rounds/load-progress';
import { emptyTakeMessage, pendingTakeLabel, progressBannerLine } from '@/lib/rounds/progress';

export const dynamic = 'force-dynamic';
type ListenPageProps = { params: Promise<{ parts?: string[] }> };
export const metadata: Metadata = { title: 'Listen' };

export default async function ListenPage({ params }: ListenPageProps) {
  const [owner, settings, viewer, progress] = await Promise.all([
    isOwner(),
    loadSettings(),
    isViewer(),
    loadAlbumProgress(),
  ]);
  if (!canViewAlbum(settings.visibility, owner, viewer)) notFound();
  const { parts = [] } = await params;
  if (parts.length > 1) notFound();
  const canPreview = canCastVote({
    visibility: settings.visibility,
    listenerVoting: settings.listenerVoting,
    owner,
    viewer,
  });
  const [config, pinned, view] = await Promise.all([
    getListenConfig(),
    getListenVersion().then(version =>
      settings.listeningDetails === 'visible' ? withVisibleDetails(version) : version
    ),
    canPreview
      ? owner
        ? ownerJudgingView()
        : listenerJudgingView(settings)
      : Promise.resolve(null),
  ]);
  const listen = withPublishedPlayback(buildListeningQueue(config, pinned, view?.version ?? null));
  const selected =
    parts[0] === undefined
      ? undefined
      : (listen.tracks.find(track => track.listenSlug === parts[0]) ??
        findListenTrack({ listen, config, trackSlug: parts[0] }) ??
        undefined);
  if (parts[0] !== undefined && selected === undefined) notFound();
  const hasAudio = listen.tracks.some(track => track.audioUrl !== null);
  const hasPreviews = listen.tracks.some(track => track.status === 'preview');
  const unavailable = hasAudio ? null : emptyTakeMessage(progress);
  const pending = pendingTakeLabel(progress);
  return (
    <main className='mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10'>
      {owner ? <RoundProgressBanner line={progressBannerLine(progress)} /> : null}
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='font-display text-3xl tracking-tight sm:text-4xl'>{config.title}</h1>
          {config.artist.length > 0 ? (
            <p className='text-muted-foreground mt-1'>{config.artist}</p>
          ) : null}
          <p className='text-muted-foreground mt-3 max-w-xl text-sm'>
            {unavailable !== null
              ? unavailable
              : hasPreviews
                ? 'An album in the making. Press play to listen, or compare takes to help choose your favorites.'
                : 'Press play and enjoy the album.'}
          </p>
        </div>
      </header>
      {hasAudio ? (
        <AlbumPlayer
          version={listen}
          surface='listen'
          voter={owner ? 'owner' : 'listener'}
          {...(selected === undefined
            ? {}
            : { initialTrackNumber: selected.number, initialTrackTitle: selected.title })}
        />
      ) : (
        <TakeAvailability
          message=''
          pendingLabel={pending}
          tracks={
            listen.tracks.length > 0
              ? listen.tracks.map(track => ({
                  trackNumber: track.number,
                  title: track.title,
                  ready: 0,
                  expected: 0,
                }))
              : progress.tracks
          }
        />
      )}
    </main>
  );
}
