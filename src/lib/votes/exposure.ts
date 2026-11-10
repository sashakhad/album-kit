import 'server-only';

import type { AlbumVersion } from '@/lib/album/types';
import { prisma } from '@/lib/prisma';
import { getConsolidatedPassVersion } from '@/lib/votes/pass-store';
import type { VoteSnapshot } from '@/lib/votes/types';
import type { AlbumSettingsValue } from '@/lib/settings/schema';

export function allTakesVoted(version: AlbumVersion, snapshot: VoteSnapshot): boolean {
  const takes = version.tracks.flatMap(track =>
    track.takes.map(take => ({
      track: track.number,
      version: take.versionSlug,
      label: take.voteLabel,
    }))
  );
  return (
    takes.length > 0 &&
    takes.every(take =>
      (snapshot.mine[take.track] ?? []).some(
        vote => vote.versionSlug === take.version && vote.takeLabel === take.label
      )
    )
  );
}

export async function markExposed(visitorId: string, round: number): Promise<void> {
  await prisma.listeningExposure.upsert({
    where: { visitorId_round: { visitorId, round } },
    create: { visitorId, round },
    update: {},
  });
}

export async function wasExposed(visitorId: string, round: number): Promise<boolean> {
  return (
    (await prisma.listeningExposure.findUnique({
      where: { visitorId_round: { visitorId, round } },
    })) !== null
  );
}

export async function isBlindForSnapshot(
  visitorId: string,
  mode: AlbumSettingsValue['listeningDetails'],
  snapshot: VoteSnapshot
): Promise<boolean> {
  if (mode === 'visible') return false;
  if (mode === 'keep-hidden') return true;
  if (await wasExposed(visitorId, snapshot.currentRound)) return false;
  const version = await getConsolidatedPassVersion(visitorId);
  return !allTakesVoted(version, snapshot);
}
