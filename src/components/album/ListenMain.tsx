'use client';

import { AlbumPlayer } from '@/components/album/AlbumPlayer';
import { RoundProgressBanner } from '@/components/album/RoundProgressBanner';
import { TakeAvailability } from '@/components/album/TakeAvailability';
import type { AlbumVersion } from '@/lib/album/types';
import type { ProgressTrack } from '@/lib/rounds/progress';

export function ListenMain({
  title,
  artist,
  blurb,
  version,
  progressLine = null,
  pendingLabel = 'Coming soon',
  availabilityTracks,
  initialTrackNumber,
  initialTrackTitle,
}: {
  title: string;
  artist: string;
  blurb: string;
  version: AlbumVersion;
  progressLine?: string | null;
  pendingLabel?: string;
  availabilityTracks?: readonly ProgressTrack[];
  initialTrackNumber?: number;
  initialTrackTitle?: string;
}) {
  const hasAudio = version.tracks.some(track => track.audioUrl !== null);
  const waiting =
    availabilityTracks ??
    version.tracks.map(track => ({
      trackNumber: track.number,
      title: track.title,
      ready: 0,
      expected: 0,
    }));

  return (
    <main className='mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10'>
      <RoundProgressBanner line={progressLine} />
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='font-display text-3xl tracking-tight sm:text-4xl'>{title}</h1>
          {artist.length > 0 ? <p className='text-muted-foreground mt-1'>{artist}</p> : null}
          <p className='text-muted-foreground mt-3 max-w-xl text-sm'>{blurb}</p>
        </div>
      </header>
      {hasAudio ? (
        <AlbumPlayer
          version={version}
          surface='listen'
          voter='listener'
          {...(initialTrackNumber === undefined ? {} : { initialTrackNumber })}
          {...(initialTrackTitle === undefined ? {} : { initialTrackTitle })}
        />
      ) : (
        <TakeAvailability message='' pendingLabel={pendingLabel} tracks={waiting} />
      )}
    </main>
  );
}
