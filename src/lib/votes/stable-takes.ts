import { takesOnTrack } from '@/lib/album/playback';
import type { AlbumVersion } from '@/lib/album/types';
import type { DownloadChoice, TrackTallies, VoteChoice, VoteSnapshot } from '@/lib/votes/types';

export type StableTakeRef = {
  stableId: string;
  trackNumber: number;
  versionSlug: string;
  voteLabel: string;
};

type Relabel = {
  versionSlug: string;
  voteLabel: string;
};

export function stableTakeRefs(version: AlbumVersion): StableTakeRef[] {
  const refs: StableTakeRef[] = [];
  for (const track of version.tracks) {
    for (const take of takesOnTrack(track)) {
      if (take.stableId === undefined) continue;
      refs.push({
        stableId: take.stableId,
        trackNumber: track.number,
        versionSlug: take.versionSlug,
        voteLabel: take.voteLabel,
      });
    }
  }
  return refs;
}

export function remapSnapshotToStableTakes(
  snapshot: VoteSnapshot,
  previous: readonly StableTakeRef[],
  next: readonly StableTakeRef[]
): VoteSnapshot {
  const nextById = new Map<string, StableTakeRef>();
  for (const ref of next) nextById.set(ref.stableId, ref);
  const relabel = new Map<string, Relabel>();
  for (const ref of previous) {
    const updated = nextById.get(ref.stableId);
    if (updated === undefined || updated.trackNumber !== ref.trackNumber) continue;
    if (updated.versionSlug === ref.versionSlug && updated.voteLabel === ref.voteLabel) continue;
    relabel.set(voteKey(ref.trackNumber, ref.versionSlug, ref.voteLabel), {
      versionSlug: updated.versionSlug,
      voteLabel: updated.voteLabel,
    });
  }
  if (relabel.size === 0) return snapshot;
  return {
    ...snapshot,
    tallies: remapTallies(snapshot.tallies, relabel),
    mine: remapChoices(snapshot.mine, relabel),
    downloads: remapChoices(snapshot.downloads, relabel),
    ...(snapshot.listenerTallies === undefined
      ? {}
      : { listenerTallies: remapTallies(snapshot.listenerTallies, relabel) }),
  };
}

function voteKey(trackNumber: number, versionSlug: string, voteLabel: string): string {
  return `${trackNumber}|${versionSlug}|${voteLabel}`;
}

function remapTallies(source: TrackTallies, relabel: Map<string, Relabel>): TrackTallies {
  const tallies: TrackTallies = {};
  for (const [trackText, versions] of Object.entries(source)) {
    const trackNumber = Number(trackText);
    tallies[trackNumber] = {};
    for (const [versionSlug, labels] of Object.entries(versions)) {
      for (const [voteLabel, value] of Object.entries(labels)) {
        const updated = relabel.get(voteKey(trackNumber, versionSlug, voteLabel));
        const nextVersion = updated?.versionSlug ?? versionSlug;
        const nextLabel = updated?.voteLabel ?? voteLabel;
        const versionTallies = tallies[trackNumber][nextVersion] ?? {};
        tallies[trackNumber][nextVersion] = versionTallies;
        versionTallies[nextLabel] = value;
      }
    }
  }
  return tallies;
}

function remapChoices<T extends VoteChoice | DownloadChoice>(
  source: Record<number, T[]>,
  relabel: Map<string, Relabel>
): Record<number, T[]> {
  const choices: Record<number, T[]> = {};
  for (const [trackText, votes] of Object.entries(source)) {
    const trackNumber = Number(trackText);
    const nextVotes: T[] = [];
    for (const vote of votes) {
      const updated = relabel.get(voteKey(trackNumber, vote.versionSlug, vote.takeLabel));
      nextVotes.push(
        updated === undefined
          ? vote
          : { ...vote, versionSlug: updated.versionSlug, takeLabel: updated.voteLabel }
      );
    }
    choices[trackNumber] = nextVotes;
  }
  return choices;
}
