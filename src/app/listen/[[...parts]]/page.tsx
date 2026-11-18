import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ListenMain } from '@/components/album/ListenMain';
import { findListenTrack, LISTEN_MAKING_COPY, LISTEN_READY_COPY } from '@/lib/album/listen';
import { getListenConfig, getPublicListenVersion } from '@/lib/album/listen-store';
import { loadSettings } from '@/lib/settings/store';
import { withVisibleDetails } from '@/lib/votes/provenance';
import { loadAlbumProgress } from '@/lib/rounds/load-progress';
import { emptyTakeMessage, pendingTakeLabel, progressBannerLine } from '@/lib/rounds/progress';

export const dynamic = 'force-dynamic';
type ListenPageProps = { params: Promise<{ parts?: string[] }> };
export const metadata: Metadata = { title: 'Listen' };

export default async function ListenPage({ params }: ListenPageProps) {
  const { parts = [] } = await params;
  if (parts.length > 1) notFound();
  const [config, settings, version, progress] = await Promise.all([
    getListenConfig(),
    loadSettings(),
    getPublicListenVersion(),
    loadAlbumProgress(),
  ]);
  const listen =
    settings.listeningDetails === 'visible'
      ? await withVisibleDetails(version, settings.maskPromptModels)
      : version;
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
  const blurb =
    unavailable !== null ? unavailable : hasPreviews ? LISTEN_MAKING_COPY : LISTEN_READY_COPY;
  return (
    <ListenMain
      title={config.title}
      artist={config.artist}
      blurb={blurb}
      version={listen}
      progressLine={progressBannerLine(progress)}
      pendingLabel={pending}
      availabilityTracks={
        listen.tracks.length > 0
          ? listen.tracks.map(track => ({
              trackNumber: track.number,
              title: track.title,
              ready: 0,
              expected: 0,
            }))
          : progress.tracks
      }
      {...(selected === undefined
        ? {}
        : { initialTrackNumber: selected.number, initialTrackTitle: selected.title })}
    />
  );
}
