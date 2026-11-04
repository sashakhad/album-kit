import type { AlbumTrack } from '@/lib/album/types';
import type { TakeTallies, VersionTakeTallies, VoteSnapshot } from '@/lib/votes/types';

export type TakeLead = {
  versionSlug: string;
  takeLabel: string;
  count: number;
};

export function countForTake(
  snapshot: VoteSnapshot,
  trackNumber: number,
  versionSlug: string,
  takeLabel: string
): number {
  return snapshot.tallies[trackNumber]?.[versionSlug]?.[takeLabel] ?? 0;
}

export function takeCountsForVersion(
  snapshot: VoteSnapshot,
  trackNumber: number,
  versionSlug: string
): TakeTallies {
  return snapshot.tallies[trackNumber]?.[versionSlug] ?? {};
}

export function takeCountsForTrack(snapshot: VoteSnapshot, track: AlbumTrack): TakeTallies {
  const counts: TakeTallies = {};
  for (const take of [...track.takes, ...(track.parkedTakes ?? [])]) {
    counts[take.label] = countForTake(snapshot, track.number, take.versionSlug, take.voteLabel);
  }
  return counts;
}

export function countForTrackVersion(
  snapshot: VoteSnapshot,
  trackNumber: number,
  versionSlug: string
): number {
  const byTake = takeCountsForVersion(snapshot, trackNumber, versionSlug);
  let total = 0;
  for (const count of Object.values(byTake)) {
    total += count;
  }
  return total;
}

export function isDownloaded(
  snapshot: VoteSnapshot,
  trackNumber: number,
  versionSlug: string,
  takeLabel: string
): boolean {
  const downloads = snapshot.downloads[trackNumber] ?? [];
  for (const item of downloads) {
    if (item.versionSlug === versionSlug && item.takeLabel === takeLabel) {
      return true;
    }
  }
  return false;
}

export function choiceForTake(
  snapshot: VoteSnapshot,
  trackNumber: number,
  versionSlug: string,
  takeLabel: string
): number {
  const choices = snapshot.mine[trackNumber] ?? [];
  for (const choice of choices) {
    if (
      choice.versionSlug === versionSlug &&
      choice.takeLabel === takeLabel &&
      choice.round === snapshot.currentRound
    ) {
      return choice.value;
    }
  }
  return 0;
}

export function leadingTakes(byVersion: VersionTakeTallies): TakeLead[] {
  let bestCount: number | null = null;
  const leaders: TakeLead[] = [];

  for (const [versionSlug, byTake] of Object.entries(byVersion)) {
    for (const [takeLabel, count] of Object.entries(byTake)) {
      if (count === 0) {
        continue;
      }
      if (bestCount === null || count > bestCount) {
        bestCount = count;
        leaders.length = 0;
        leaders.push({ versionSlug, takeLabel, count });
        continue;
      }
      if (count === bestCount) {
        leaders.push({ versionSlug, takeLabel, count });
      }
    }
  }

  return leaders;
}
