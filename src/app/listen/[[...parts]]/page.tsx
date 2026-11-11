import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlbumPlayer } from '@/components/album/AlbumPlayer';
import { buildListeningQueue, findListenTrack } from '@/lib/album/listen';
import { getListenConfig, getListenVersion } from '@/lib/album/listen-store';
import { isOwner } from '@/lib/owner/auth';
import { loadSettings } from '@/lib/settings/store';
import { canCastVote, canViewAlbum } from '@/lib/settings/access';
import { isViewer } from '@/lib/owner/viewer';
import { ownerJudgingView } from '@/lib/votes/owner-view';
import { listenerJudgingView } from '@/lib/votes/listener-view';
import { withVisibleDetails } from '@/lib/votes/provenance';

export const dynamic = 'force-dynamic';
type ListenPageProps = { params: Promise<{ parts?: string[] }> };
export const metadata: Metadata = { title: 'Listen' };

export default async function ListenPage({ params }: ListenPageProps) {
  const [owner, settings, viewer] = await Promise.all([isOwner(), loadSettings(), isViewer()]);
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
  const listen = buildListeningQueue(config, pinned, view?.version ?? null);
  const selected =
    parts[0] === undefined
      ? undefined
      : (listen.tracks.find(track => track.listenSlug === parts[0]) ??
        findListenTrack({ listen, config, trackSlug: parts[0] }) ??
        undefined);
  if (parts[0] !== undefined && selected === undefined) notFound();
  const hasAudio = listen.tracks.some(track => track.audioUrl !== null);
  const hasPreviews = listen.tracks.some(track => track.status === 'preview');
  return (
    <main className='mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10'>
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='font-display text-3xl tracking-tight sm:text-4xl'>{config.title}</h1>
          {config.artist.length > 0 ? (
            <p className='text-muted-foreground mt-1'>{config.artist}</p>
          ) : null}
          <p className='text-muted-foreground mt-3 max-w-xl text-sm'>
            {hasPreviews
              ? 'An album in the making. Press play to listen, or compare takes to help choose your favorites.'
              : hasAudio
                ? 'Press play and enjoy the album.'
                : 'Music is on the way. Check back soon.'}
          </p>
        </div>
        {owner ? (
          <Link
            href='/final'
            className='inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 text-sm hover:bg-white/6'
          >
            Choose final picks
          </Link>
        ) : null}
      </header>
      {listen.tracks.length > 0 ? (
        <AlbumPlayer
          version={listen}
          surface='listen'
          voter={owner ? 'owner' : 'listener'}
          {...(selected === undefined
            ? {}
            : { initialTrackNumber: selected.number, initialTrackTitle: selected.title })}
        />
      ) : (
        <div className='text-muted-foreground rounded-2xl border border-white/10 p-6'>
          <p>
            {owner
              ? 'Add takes or choose your final picks to start listening.'
              : 'No tracks are ready to play yet.'}
          </p>
        </div>
      )}
    </main>
  );
}
