import 'server-only';

import { getPrisma } from '@/lib/prisma';
import { LISTENER_VOTE_CAP, ListenerVoteLimitError, nextListenerValue } from '@/lib/votes/abuse';
import { getVisitorCurrentRound } from '@/lib/votes/pass-store';
import { votesForCurrentPass, votesToCarryForward, type PassVote } from '@/lib/votes/pass';
import {
  EMPTY_VOTE_SNAPSHOT,
  type TrackTallies,
  type VoteDelta,
  type VoteSnapshot,
} from '@/lib/votes/types';
import { wasExposed } from '@/lib/votes/exposure';
import { isListenerVisitorId } from '@/lib/votes/identity';

export function emptyVoteSnapshot(): VoteSnapshot {
  return {
    tallies: {},
    mine: {},
    downloads: {},
    versionTotals: {},
    currentRound: 1,
  };
}

export async function getVoteSnapshot(
  visitorId: string,
  options?: { round?: number; carry?: boolean }
): Promise<VoteSnapshot> {
  const db = getPrisma();
  const [votes, downloads, storedRound] = await Promise.all([
    db.vote.findMany({
      where: { visitorId },
      select: {
        visitorId: true,
        trackNumber: true,
        versionSlug: true,
        takeLabel: true,
        value: true,
        round: true,
      },
    }),
    visitorId.length === 0
      ? Promise.resolve([])
      : db.download.findMany({
          where: { visitorId },
          select: {
            trackNumber: true,
            versionSlug: true,
            takeLabel: true,
            round: true,
          },
        }),
    options?.round === undefined
      ? getVisitorCurrentRound(visitorId)
      : Promise.resolve(options.round),
  ]);

  const currentRound = options?.round ?? storedRound;
  const snapshot = emptyVoteSnapshot();
  snapshot.currentRound = currentRound;

  const passVotes: PassVote[] = [];
  for (const vote of votes) {
    if (vote.visitorId !== visitorId) {
      continue;
    }
    passVotes.push({
      versionSlug: vote.versionSlug,
      trackNumber: vote.trackNumber,
      takeLabel: vote.takeLabel,
      round: vote.round,
      value: vote.value,
      visitorId: vote.visitorId,
    });
  }

  const visible =
    options?.carry === false
      ? passVotes.filter(vote => vote.round === currentRound)
      : votesForCurrentPass(passVotes, currentRound);

  for (const vote of visible) {
    const trackTallies = snapshot.tallies[vote.trackNumber] ?? {};
    const versionTallies = trackTallies[vote.versionSlug] ?? {};
    versionTallies[vote.takeLabel] = (versionTallies[vote.takeLabel] ?? 0) + vote.value;
    trackTallies[vote.versionSlug] = versionTallies;
    snapshot.tallies[vote.trackNumber] = trackTallies;
    snapshot.versionTotals[vote.versionSlug] =
      (snapshot.versionTotals[vote.versionSlug] ?? 0) + vote.value;
    if (vote.visitorId === visitorId) {
      const mine = snapshot.mine[vote.trackNumber] ?? [];
      mine.push({
        versionSlug: vote.versionSlug,
        takeLabel: vote.takeLabel,
        value: vote.value,
        round: vote.round,
      });
      snapshot.mine[vote.trackNumber] = mine;
    }
  }

  for (const download of downloads) {
    const mine = snapshot.downloads[download.trackNumber] ?? [];
    mine.push({
      versionSlug: download.versionSlug,
      takeLabel: download.takeLabel,
      round: download.round,
    });
    snapshot.downloads[download.trackNumber] = mine;
  }

  if (visitorId === 'owner') {
    snapshot.listenerTallies = await loadListenerTallies(currentRound);
  }

  return snapshot;
}

async function loadListenerTallies(round: number): Promise<TrackTallies> {
  const votes = await getPrisma().vote.findMany({
    where: { round, visitorId: { startsWith: 'listener:' } },
    select: {
      visitorId: true,
      trackNumber: true,
      versionSlug: true,
      takeLabel: true,
      value: true,
      round: true,
    },
  });
  const tallies: TrackTallies = {};
  for (const vote of votes) {
    if (!isListenerVisitorId(vote.visitorId) || vote.round !== round) {
      continue;
    }
    const trackTallies = tallies[vote.trackNumber] ?? {};
    const versionTallies = trackTallies[vote.versionSlug] ?? {};
    versionTallies[vote.takeLabel] = (versionTallies[vote.takeLabel] ?? 0) + vote.value;
    trackTallies[vote.versionSlug] = versionTallies;
    tallies[vote.trackNumber] = trackTallies;
  }
  return tallies;
}

export async function safeVoteSnapshot(visitorId: string): Promise<VoteSnapshot> {
  try {
    return await getVoteSnapshot(visitorId);
  } catch {
    return EMPTY_VOTE_SNAPSHOT;
  }
}

export async function castVote(args: {
  visitorId: string;
  trackNumber: number;
  versionSlug: string;
  takeLabel: string;
  value: VoteDelta;
  round?: number;
}): Promise<VoteSnapshot> {
  const db = getPrisma();
  const listener = isListenerVisitorId(args.visitorId);
  const round = args.round ?? (await getVisitorCurrentRound(args.visitorId));
  const detailsExposed = await wasExposed(args.visitorId, round);
  const existing = await db.vote.findMany({
    where: { visitorId: args.visitorId },
    select: { versionSlug: true, trackNumber: true, takeLabel: true, round: true, value: true },
  });
  let base = 0;
  if (listener) {
    for (const vote of existing) {
      if (
        vote.round === round &&
        vote.versionSlug === args.versionSlug &&
        vote.trackNumber === args.trackNumber &&
        vote.takeLabel === args.takeLabel
      ) {
        base = vote.value;
        break;
      }
    }
    if (nextListenerValue(base, args.value, LISTENER_VOTE_CAP) === null) {
      throw new ListenerVoteLimitError();
    }
  } else {
    const carried = votesToCarryForward(existing, round);
    for (const vote of carried) {
      if (
        vote.versionSlug === args.versionSlug &&
        vote.trackNumber === args.trackNumber &&
        vote.takeLabel === args.takeLabel
      ) {
        base = vote.value;
        break;
      }
    }
  }

  await db.vote.upsert({
    where: {
      visitorId_trackNumber_versionSlug_takeLabel_round: {
        visitorId: args.visitorId,
        trackNumber: args.trackNumber,
        versionSlug: args.versionSlug,
        takeLabel: args.takeLabel,
        round,
      },
    },
    create: {
      visitorId: args.visitorId,
      trackNumber: args.trackNumber,
      versionSlug: args.versionSlug,
      takeLabel: args.takeLabel,
      value: base + args.value,
      round,
      detailsExposed,
    },
    update: {
      value: {
        increment: args.value,
      },
      ...(detailsExposed ? { detailsExposed: true } : {}),
    },
  });

  return getVoteSnapshot(
    args.visitorId,
    listener
      ? { round, carry: false }
      : args.round === undefined
        ? undefined
        : { round: args.round }
  );
}
