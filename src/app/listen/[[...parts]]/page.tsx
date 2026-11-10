import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AlbumPlayer } from '@/components/album/AlbumPlayer';
import { loadAlbumConfig } from '@/lib/album/album-config';
import { findListenTrack } from '@/lib/album/listen';
import { getListenVersion } from '@/lib/album/listen-store';
import { isOwner } from '@/lib/owner/auth';
import { loadSettings } from '@/lib/settings/store';
import { canViewAlbum } from '@/lib/settings/access';
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

  const [config, listen] = await Promise.all([loadAlbumConfig(), getListenVersion()]);
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

  const [config, listen] = await Promise.all([loadAlbumConfig(), getListenVersion()]);
  if (listen.tracks.length === 0) {
    return (
      <main className='mx-auto max-w-5xl px-6 py-12'>
        <p className='text-muted-foreground'>Nothing here yet.</p>
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
