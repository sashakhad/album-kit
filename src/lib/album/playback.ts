import type { AlbumTake, AlbumTrack } from '@/lib/album/types';

export function trackKey(track: AlbumTrack): string {
  return `${track.kind}-${track.number}`;
}

export function collectPlayableIndexes(tracks: AlbumTrack[]): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < tracks.length; index += 1) {
    if (tracks[index]?.audioUrl !== null) {
      indexes.push(index);
    }
  }
  return indexes;
}

export function collectTakeLabels(tracks: AlbumTrack[]): string[] {
  const labels: string[] = [];
  for (const track of tracks) {
    for (const take of track.takes) {
      if (!labels.includes(take.label)) {
        labels.push(take.label);
      }
    }
  }
  return labels;
}

export function takesOnTrack(track: AlbumTrack): AlbumTake[] {
  return [...track.takes, ...(track.parkedTakes ?? [])];
}

export function findTakeOnTrack(track: AlbumTrack, label: string): AlbumTake | null {
  for (const take of takesOnTrack(track)) {
    if (take.label === label) {
      return take;
    }
  }
  return null;
}

export function findTakeByVersionAndLabel(
  track: AlbumTrack,
  versionSlug: string,
  voteLabel: string
): AlbumTake | null {
  for (const take of takesOnTrack(track)) {
    if (take.versionSlug === versionSlug && take.voteLabel === voteLabel) {
      return take;
    }
  }
  return null;
}

export function isOnAlbumShortlist(track: AlbumTrack): boolean {
  if (track.takes.length > 0) {
    return true;
  }
  return (track.parkedTakes?.length ?? 0) === 0;
}

export function isParkedTake(track: AlbumTrack, take: AlbumTake | null): boolean {
  if (take === null) {
    return false;
  }
  for (const parked of track.parkedTakes ?? []) {
    if (parked.label === take.label) {
      return true;
    }
  }
  return false;
}

export function takeForTrack(
  track: AlbumTrack,
  selectedTakeByTrack: Record<string, string>,
  preferredLabel: string
): AlbumTake | null {
  const selectedLabel = selectedTakeByTrack[trackKey(track)];
  if (selectedLabel !== undefined) {
    const selected = findTakeOnTrack(track, selectedLabel);
    if (selected !== null) {
      return selected;
    }
  }

  const preferred = track.takes.find(take => take.label === preferredLabel);
  if (preferred !== undefined) {
    return preferred;
  }

  return track.takes[0] ?? null;
}

export function audioUrlForTrack(
  track: AlbumTrack,
  selectedTakeByTrack: Record<string, string>,
  preferredLabel: string
): string | null {
  return takeForTrack(track, selectedTakeByTrack, preferredLabel)?.audioUrl ?? track.audioUrl;
}

export function nextPlayableIndex(
  playableIndexes: number[],
  currentIndex: number,
  wrap: boolean
): number | null {
  for (const index of playableIndexes) {
    if (index > currentIndex) {
      return index;
    }
  }
  if (!wrap) {
    return null;
  }
  return playableIndexes[0] ?? null;
}

export function previousPlayableIndex(
  playableIndexes: number[],
  currentIndex: number
): number | null {
  for (let i = playableIndexes.length - 1; i >= 0; i -= 1) {
    const index = playableIndexes[i];
    if (index !== undefined && index < currentIndex) {
      return index;
    }
  }
  return playableIndexes[playableIndexes.length - 1] ?? null;
}

export function nextVariation(
  takes: readonly AlbumTake[],
  currentTake: AlbumTake | null,
  wrap: boolean
): AlbumTake | null {
  if (takes.length === 0) {
    return null;
  }

  const currentIndex =
    currentTake === null ? -1 : takes.findIndex(take => take.label === currentTake.label);
  const nextIndex = currentIndex + 1;
  if (nextIndex < takes.length) {
    return takes[nextIndex] ?? null;
  }
  if (!wrap) {
    return null;
  }
  return takes[0] ?? null;
}

export function previousVariation(
  takes: readonly AlbumTake[],
  currentTake: AlbumTake | null
): AlbumTake | null {
  if (takes.length === 0) {
    return null;
  }

  const currentIndex =
    currentTake === null ? 0 : takes.findIndex(take => take.label === currentTake.label);
  if (currentIndex > 0) {
    return takes[currentIndex - 1] ?? null;
  }
  return takes[takes.length - 1] ?? null;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
