import { slugifyTrackTitle } from '@/lib/album/slug';
import type { AlbumTrack } from '@/lib/album/types';

export function voteHref(args?: {
  title: string;
  versionSlug?: string;
  takeLabel?: string;
}): string {
  if (args === undefined) {
    return '/vote';
  }
  const track = slugifyTrackTitle(args.title);
  if (args.versionSlug === undefined || args.takeLabel === undefined) {
    return `/vote/${track}`;
  }
  return `/vote/${track}/${args.versionSlug}/${args.takeLabel.toLowerCase()}`;
}

export function listenHref(args?: { title: string }): string {
  if (args === undefined) {
    return '/listen';
  }
  return `/listen/${slugifyTrackTitle(args.title)}`;
}

export function parseTakeSegment(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const label = value.toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(label)) {
    return null;
  }
  return label;
}

export function resolveTrack(trackSlug: string, tracks: AlbumTrack[]): AlbumTrack | null {
  if (/^\d{1,2}$/.test(trackSlug)) {
    const number = Number(trackSlug);
    return tracks.find(track => track.number === number) ?? null;
  }

  for (const track of tracks) {
    if (slugifyTrackTitle(track.title) === trackSlug) {
      return track;
    }
  }
  return null;
}

export function resolveTrackNumber(trackSlug: string, tracks: AlbumTrack[]): number | null {
  return resolveTrack(trackSlug, tracks)?.number ?? null;
}

export function indexForTrack(tracks: AlbumTrack[], target: AlbumTrack): number | null {
  const index = tracks.findIndex(
    track => track.number === target.number && track.title === target.title
  );
  if (index < 0) {
    return null;
  }
  if (tracks[index]?.audioUrl === null) {
    return null;
  }
  return index;
}

export function indexForTrackNumber(tracks: AlbumTrack[], trackNumber: number): number | null {
  const index = tracks.findIndex(track => track.number === trackNumber);
  if (index < 0) {
    return null;
  }
  if (tracks[index]?.audioUrl === null) {
    return null;
  }
  return index;
}
