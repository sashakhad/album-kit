import type { CanonicalTrack } from '@/lib/album/build-version';
import type { AlbumTake, AlbumTrack, AlbumVersion } from '@/lib/album/types';

export const PASS_SLUG = 'pass';

export type PassVote = {
  versionSlug: string;
  trackNumber: number;
  takeLabel: string;
  round: number;
  value: number;
  visitorId?: string;
};

export type ParkedTakeRef = {
  versionSlug: string;
  trackNumber: number;
  takeLabel: string;
};

function takeVoteKey(vote: {
  versionSlug: string;
  trackNumber: number;
  takeLabel: string;
  visitorId?: string;
}): string {
  return `${vote.visitorId ?? ''}|${vote.versionSlug}|${vote.trackNumber}|${vote.takeLabel}`;
}

export function votesToCarryForward(votes: readonly PassVote[], currentRound: number): PassVote[] {
  const latestPrior = new Map<string, PassVote>();

  for (const vote of votes) {
    if (vote.round >= currentRound) {
      continue;
    }
    const key = takeVoteKey(vote);
    const existing = latestPrior.get(key);
    if (existing === undefined || vote.round > existing.round) {
      latestPrior.set(key, vote);
    }
  }

  const carried: PassVote[] = [];
  for (const vote of latestPrior.values()) {
    if (vote.value <= 0) {
      continue;
    }
    carried.push({
      versionSlug: vote.versionSlug,
      trackNumber: vote.trackNumber,
      takeLabel: vote.takeLabel,
      value: vote.value,
      round: currentRound,
      ...(vote.visitorId === undefined ? {} : { visitorId: vote.visitorId }),
    });
  }
  return carried;
}

export function votesForCurrentPass(votes: readonly PassVote[], currentRound: number): PassVote[] {
  const current: PassVote[] = [];
  const currentKeys = new Set<string>();

  for (const vote of votes) {
    if (vote.round !== currentRound) {
      continue;
    }
    current.push(vote);
    currentKeys.add(takeVoteKey(vote));
  }

  const visible: PassVote[] = [...current];
  for (const vote of votesToCarryForward(votes, currentRound)) {
    if (currentKeys.has(takeVoteKey(vote))) {
      continue;
    }
    visible.push(vote);
  }
  return visible;
}

export function wasDownvotedBefore(args: {
  versionSlug: string;
  trackNumber: number;
  takeLabel: string;
  currentRound: number;
  votes: readonly PassVote[];
}): boolean {
  for (const vote of args.votes) {
    if (
      vote.versionSlug === args.versionSlug &&
      vote.trackNumber === args.trackNumber &&
      vote.takeLabel === args.takeLabel &&
      vote.round < args.currentRound &&
      vote.value < 0
    ) {
      return true;
    }
  }
  return false;
}

export function isTakeParked(args: {
  versionSlug: string;
  trackNumber: number;
  takeLabel: string;
  parked: readonly ParkedTakeRef[];
}): boolean {
  for (const item of args.parked) {
    if (
      item.versionSlug === args.versionSlug &&
      item.trackNumber === args.trackNumber &&
      item.takeLabel === args.takeLabel
    ) {
      return true;
    }
  }
  return false;
}

export function isTakeVisibleInPass(args: {
  currentRound: number;
  versionSlug: string;
  trackNumber: number;
  takeLabel: string;
  votes: readonly PassVote[];
  parked?: readonly ParkedTakeRef[];
}): boolean {
  if (args.currentRound <= 1) {
    return true;
  }
  if (wasDownvotedBefore(args)) {
    return false;
  }
  return !isTakeParked({
    versionSlug: args.versionSlug,
    trackNumber: args.trackNumber,
    takeLabel: args.takeLabel,
    parked: args.parked ?? [],
  });
}

export function filterVersionForPass(args: {
  version: AlbumVersion;
  currentRound: number;
  votes: readonly PassVote[];
  parked?: readonly ParkedTakeRef[];
  pinnedTrackNumber?: number;
  pinnedTakeLabel?: string;
}): AlbumVersion {
  const tracks = args.version.tracks.map(track => {
    const pinned =
      args.pinnedTrackNumber === track.number && args.pinnedTakeLabel !== undefined
        ? args.pinnedTakeLabel
        : null;
    return filterTrackForPass({
      track,
      versionSlug: args.version.slug,
      currentRound: args.currentRound,
      votes: args.votes,
      parked: args.parked ?? [],
      pinned,
    });
  });

  return { ...args.version, tracks };
}

export function buildConsolidatedPassVersion(args: {
  versions: readonly AlbumVersion[];
  currentRound: number;
  votes: readonly PassVote[];
  parked?: readonly ParkedTakeRef[];
  tracklist: readonly CanonicalTrack[];
}): AlbumVersion {
  const tracks: AlbumTrack[] = [];
  const parked = args.parked ?? [];

  for (const canonical of args.tracklist) {
    const takes: AlbumTake[] = [];
    const parkedTakes: AlbumTake[] = [];
    let prompt: string | null = null;
    let hadAnyTake = false;

    for (const version of args.versions) {
      const track = version.tracks.find(
        item => item.kind === 'album' && item.number === canonical.number
      );
      if (track === undefined) {
        continue;
      }
      if (prompt === null && track.prompt !== null) {
        prompt = track.prompt;
      }
      for (const take of track.takes) {
        hadAnyTake = true;
        const labeled = {
          label: `${version.title} ${take.voteLabel}`,
          filename: take.filename,
          audioUrl: take.audioUrl,
          versionSlug: take.versionSlug,
          voteLabel: take.voteLabel,
          ...(take.prompt === undefined ? {} : { prompt: take.prompt }),
        };
        if (
          isTakeVisibleInPass({
            currentRound: args.currentRound,
            versionSlug: take.versionSlug,
            trackNumber: canonical.number,
            takeLabel: take.voteLabel,
            votes: args.votes,
            parked,
          })
        ) {
          takes.push(labeled);
          continue;
        }
        if (
          isTakeParked({
            versionSlug: take.versionSlug,
            trackNumber: canonical.number,
            takeLabel: take.voteLabel,
            parked,
          }) &&
          !wasDownvotedBefore({
            versionSlug: take.versionSlug,
            trackNumber: canonical.number,
            takeLabel: take.voteLabel,
            currentRound: args.currentRound,
            votes: args.votes,
          })
        ) {
          parkedTakes.push(labeled);
        }
      }
    }

    const first = takes[0];
    if (first === undefined && hadAnyTake && parkedTakes.length === 0) {
      continue;
    }

    tracks.push({
      number: canonical.number,
      title: canonical.title,
      kind: 'album',
      filename: first?.filename ?? null,
      audioUrl: first?.audioUrl ?? null,
      takes,
      parkedTakes,
      ...(canonical.parked === true ? { parked: true } : {}),
      prompt,
    });
  }

  return {
    slug: PASS_SLUG,
    folder: 'pass',
    title: `Round ${args.currentRound}`,
    author: '',
    blurb: 'Earlier downvotes are out. Upvotes carry. Parked takes sit under Possible renames.',
    tracks,
  };
}

function filterTrackForPass(args: {
  track: AlbumTrack;
  versionSlug: string;
  currentRound: number;
  votes: readonly PassVote[];
  parked: readonly ParkedTakeRef[];
  pinned: string | null;
}): AlbumTrack {
  const visible: AlbumTake[] = [];
  const parkedTakes: AlbumTake[] = [];

  for (const take of args.track.takes) {
    const pinned = args.pinned === take.voteLabel || args.pinned === take.label;
    if (
      pinned ||
      isTakeVisibleInPass({
        currentRound: args.currentRound,
        versionSlug: take.versionSlug,
        trackNumber: args.track.number,
        takeLabel: take.voteLabel,
        votes: args.votes,
        parked: args.parked,
      })
    ) {
      visible.push(take);
      continue;
    }
    if (
      isTakeParked({
        versionSlug: take.versionSlug,
        trackNumber: args.track.number,
        takeLabel: take.voteLabel,
        parked: args.parked,
      })
    ) {
      parkedTakes.push(take);
    }
  }

  const first = visible[0];
  if (first === undefined) {
    return {
      ...args.track,
      filename: null,
      audioUrl: null,
      takes: [],
      parkedTakes,
    };
  }

  return {
    ...args.track,
    filename: first.filename,
    audioUrl: first.audioUrl,
    takes: visible,
    parkedTakes,
  };
}
