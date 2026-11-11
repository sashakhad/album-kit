import 'server-only';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { albumTracklist, listSets } from '@/lib/album/load-album';
import type { AlbumVersion } from '@/lib/album/types';
import { getPrisma } from '@/lib/prisma';
import {
  buildConsolidatedPassVersion,
  filterVersionForPass,
  votesToCarryForward,
  type ParkedTakeRef,
  type PassVote,
} from '@/lib/votes/pass';

export async function getLatestRound(): Promise<number> {
  const db = getPrisma();
  const state = await db.judgingState.upsert({
    where: { id: 'default' },
    create: { id: 'default', latestRound: 1 },
    update: {},
  });
  return state.latestRound;
}

export async function getVisitorCurrentRound(visitorId: string): Promise<number> {
  if (visitorId.length === 0) {
    return 1;
  }

  const db = getPrisma();
  const row = await db.visitorRound.findUnique({
    where: { visitorId },
    select: { currentRound: true },
  });
  return row?.currentRound ?? 1;
}

export async function advanceVisitorRound(visitorId: string): Promise<number> {
  const db = getPrisma();
  const current = await getVisitorCurrentRound(visitorId);
  const nextRound = current + 1;
  const votes = visitorId.length === 0 ? [] : await loadPassVotes(visitorId);
  const carried = votesToCarryForward(votes, nextRound);

  await db.visitorRound.upsert({
    where: { visitorId },
    create: { visitorId, currentRound: nextRound },
    update: { currentRound: nextRound },
  });

  if (carried.length > 0) {
    const rows: {
      visitorId: string;
      versionSlug: string;
      trackNumber: number;
      takeLabel: string;
      value: number;
      round: number;
    }[] = [];
    for (const vote of carried) {
      rows.push({
        visitorId,
        versionSlug: vote.versionSlug,
        trackNumber: vote.trackNumber,
        takeLabel: vote.takeLabel,
        value: vote.value,
        round: nextRound,
      });
    }
    await db.vote.createMany({
      data: rows,
      skipDuplicates: true,
    });
  }

  const latest = await getLatestRound();
  if (nextRound > latest) {
    await db.judgingState.update({
      where: { id: 'default' },
      data: { latestRound: nextRound },
    });
  }

  return nextRound;
}

export async function loadPassVotes(visitorId: string): Promise<PassVote[]> {
  if (visitorId.length === 0) {
    return [];
  }

  const db = getPrisma();
  const votes = await db.vote.findMany({
    where: { visitorId },
    select: { versionSlug: true, trackNumber: true, takeLabel: true, round: true, value: true },
  });

  const passVotes: PassVote[] = [];
  for (const vote of votes) {
    passVotes.push({
      versionSlug: vote.versionSlug,
      trackNumber: vote.trackNumber,
      takeLabel: vote.takeLabel,
      round: vote.round,
      value: vote.value,
    });
  }
  return passVotes;
}

export async function loadParkedTakes(): Promise<ParkedTakeRef[]> {
  const db = getPrisma();
  const rows = await db.parkedTake.findMany({
    select: { versionSlug: true, trackNumber: true, takeLabel: true },
  });
  const parked: ParkedTakeRef[] = [];
  for (const row of rows) {
    parked.push({
      versionSlug: row.versionSlug,
      trackNumber: row.trackNumber,
      takeLabel: row.takeLabel,
    });
  }
  return parked;
}

export async function applyPassFilterForVisitor(args: {
  version: AlbumVersion;
  visitorId: string;
  pinnedTrackNumber?: number;
  pinnedTakeLabel?: string;
}): Promise<AlbumVersion> {
  const [currentRound, votes, parked] = await Promise.all([
    getVisitorCurrentRound(args.visitorId),
    loadPassVotes(args.visitorId),
    loadParkedTakes(),
  ]);

  return filterVersionForPass({
    version: args.version,
    currentRound,
    votes,
    parked,
    ...(args.pinnedTrackNumber === undefined ? {} : { pinnedTrackNumber: args.pinnedTrackNumber }),
    ...(args.pinnedTakeLabel === undefined ? {} : { pinnedTakeLabel: args.pinnedTakeLabel }),
  });
}

export async function getConsolidatedPassVersion(visitorId: string): Promise<AlbumVersion> {
  return (await getConsolidatedPass(visitorId)).version;
}

export async function getConsolidatedPass(visitorId: string) {
  const [config, versions, currentRound, votes, parked] = await Promise.all([
    loadAlbumConfig(),
    listSets(),
    getVisitorCurrentRound(visitorId),
    loadPassVotes(visitorId),
    loadParkedTakes(),
  ]);

  const version = buildConsolidatedPassVersion({
    versions,
    currentRound,
    votes,
    parked,
    tracklist: albumTracklist(config),
  });
  return { version, versions, currentRound, votes };
}

export async function upsertDownload(args: {
  visitorId: string;
  trackNumber: number;
  versionSlug: string;
  takeLabel: string;
}): Promise<void> {
  const db = getPrisma();
  const round = await getVisitorCurrentRound(args.visitorId);
  await db.download.upsert({
    where: {
      visitorId_trackNumber_versionSlug_takeLabel: {
        visitorId: args.visitorId,
        trackNumber: args.trackNumber,
        versionSlug: args.versionSlug,
        takeLabel: args.takeLabel,
      },
    },
    create: {
      visitorId: args.visitorId,
      trackNumber: args.trackNumber,
      versionSlug: args.versionSlug,
      takeLabel: args.takeLabel,
      round,
    },
    update: {},
  });
}
