import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AlbumPlayer } from '@/components/album/AlbumPlayer';
import { findListenTrack } from '@/lib/album/listen';
import { getListenConfig, getListenVersion } from '@/lib/album/listen-store';
import { isOwner } from '@/lib/owner/auth';
import { loadSettings } from '@/lib/settings/store';
import { canCastVote, canViewAlbum } from '@/lib/settings/access';
import { isViewer } from '@/lib/owner/viewer';

export const dynamic = 'force-dynamic';

type ListenPageProps = {
  params: Promise<{ parts?: string[] }>;
};

export async function generateMetadata({ params }: ListenPageProps): Promise<Metadata> {
  const [owner, settings, viewer] = await Promise.all([isOwner(), loadSettings(), isViewer()]);
  if (!canViewAlbum(settings.visibility, owner, viewer)) return { title: 'Listen' };
  const { parts = [] } = await params;
  const trackSlug = parts[0];
  if (trackSlug === undefined || parts.length > 1) {
    return { title: 'Listen' };
  }

  const [config, listen] = await Promise.all([getListenConfig(), getListenVersion()]);
  const track = findListenTrack({ listen, config, trackSlug });
  return { title: track === null ? 'Listen' : track.title };
}

export default async function ListenPage({ params }: ListenPageProps) {
  const [owner, settings, viewer] = await Promise.all([isOwner(), loadSettings(), isViewer()]);
  if (!canViewAlbum(settings.visibility, owner, viewer)) notFound();
  const { parts = [] } = await params;
  if (parts.length > 1) {
    notFound();
  }

  const [config, listen] = await Promise.all([getListenConfig(), getListenVersion()]);
  if (listen.tracks.length === 0) {
    const canVote = canCastVote({
      visibility: settings.visibility,
      listenerVoting: settings.listenerVoting,
      owner,
      viewer,
    });
    return (
      <main className='mx-auto max-w-5xl space-y-4 px-6 py-12'>
        <h1 className='font-display text-3xl'>The album is being picked</h1>
        <p className='text-muted-foreground max-w-xl text-sm leading-relaxed'>
          {owner
            ? 'Choose your favorite take for each track in Final picks. Your choices will show up here right away.'
            : canVote
              ? 'The owner has not published any final takes yet. You can still listen and score the current takes on Vote.'
              : 'The owner has not published any final takes yet.'}
        </p>
        {canVote ? (
          <Link
            href={owner ? '/final' : '/vote'}
            className='bg-primary text-primary-foreground hover:bg-primary/90 inline-flex rounded-lg px-4 py-2 text-sm font-medium'
          >
            {owner ? 'Choose final picks' : 'Go to voting'}
          </Link>
        ) : null}
      </main>
    );
  }

  const trackSlug = parts[0];
  const track = trackSlug === undefined ? null : findListenTrack({ listen, config, trackSlug });
  if (trackSlug !== undefined && track === null) {
    notFound();
  }

  return (
    <main className='mx-auto max-w-5xl px-6 py-12'>
      {track === null ? (
        <AlbumPlayer key={listen.folder} version={listen} surface='listen' />
      ) : (
        <AlbumPlayer
          key={listen.folder}
          version={listen}
          surface='listen'
          initialTrackNumber={track.number}
          initialTrackTitle={track.title}
        />
      )}
    </main>
  );
}
