import { LISTEN_MAKING_COPY, LISTEN_READY_COPY } from './listen-copy.mjs';
import type { AlbumVersion } from './types';

export type PreviewListenTake = {
  id: string;
  src: string;
  label: string;
};

export type PreviewListenTrack = {
  number: number;
  title: string;
  slug: string;
  takes: PreviewListenTake[];
};

/** The listen-page version for a standalone album file. */
export function previewListenVersion(
  album: { title: string; artist: string },
  tracks: readonly PreviewListenTrack[]
): AlbumVersion {
  return {
    slug: 'listen',
    folder: 'listen',
    title: album.title,
    author: album.artist,
    blurb: '',
    tracks: tracks.map(track => {
      const takes = track.takes.map(take => ({
        label: take.label,
        filename: take.id,
        audioUrl: take.src,
        versionSlug: 'preview',
        voteLabel: take.label,
      }));
      const first = takes[0];
      return {
        number: track.number,
        title: track.title,
        kind: 'album' as const,
        filename: first?.filename ?? null,
        audioUrl: first?.audioUrl ?? null,
        takes,
        parkedTakes: [],
        prompt: null,
        listenSlug: track.slug,
        status: takes.length > 0 ? ('preview' as const) : ('waiting' as const),
      };
    }),
  };
}

export function previewListenBlurb(version: AlbumVersion): string {
  const hasAudio = version.tracks.some(track => track.audioUrl !== null);
  if (!hasAudio) {
    return 'Music is on the way. Tracks will appear here as they become available.';
  }
  if (version.tracks.some(track => track.status === 'preview')) {
    return LISTEN_MAKING_COPY;
  }
  return LISTEN_READY_COPY;
}
