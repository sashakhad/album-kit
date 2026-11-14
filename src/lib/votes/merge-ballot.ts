import 'server-only';

import { OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { viewerInviteId, viewerInviteIdFromRequest } from '@/lib/owner/viewer';
import { getPrisma } from '@/lib/prisma';
import { isListenerVisitorId } from '@/lib/votes/identity';
import {
  inviteListenerVisitorId,
  listenerIdFromPage,
  listenerIdFromRequest,
  publicListenerVisitorId,
} from '@/lib/votes/listener-id';

export function listenerBallotIds(source: {
  listenerId: string | null;
  inviteId: string | null;
}): string[] {
  const ids: string[] = [];
  if (source.listenerId !== null && source.listenerId.length > 0) {
    ids.push(publicListenerVisitorId(source.listenerId));
  }
  if (source.inviteId !== null && source.inviteId.length > 0) {
    ids.push(inviteListenerVisitorId(source.inviteId));
  }
  return ids.filter(isListenerVisitorId);
}

async function browserBallotIds(request?: Request): Promise<string[]> {
  if (request === undefined) {
    const [listenerId, inviteId] = await Promise.all([listenerIdFromPage(), viewerInviteId()]);
    return listenerBallotIds({ listenerId, inviteId });
  }
  return listenerBallotIds({
    listenerId: listenerIdFromRequest(request),
    inviteId: await viewerInviteIdFromRequest(request),
  });
}

export async function countBrowserListenerVotes(request?: Request): Promise<number> {
  try {
    const ids = await browserBallotIds(request);
    if (ids.length === 0) {
      return 0;
    }
    const rows = await getPrisma().vote.findMany({
      where: { visitorId: { in: ids } },
      select: { value: true },
    });
    let count = 0;
    for (const row of rows) {
      if (row.value !== 0) {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

export async function mergeBrowserListenerVotes(request?: Request): Promise<number> {
  return mergeListenerBallots(await browserBallotIds(request));
}

export async function mergeListenerBallots(visitorIds: readonly string[]): Promise<number> {
  const ids: string[] = [];
  for (const visitorId of visitorIds) {
    if (isListenerVisitorId(visitorId) && visitorId !== OWNER_VISITOR_ID) {
      ids.push(visitorId);
    }
  }
  if (ids.length === 0) {
    return 0;
  }

  const db = getPrisma();
  return db.$transaction(async tx => {
    const votes = await tx.vote.findMany({ where: { visitorId: { in: ids } } });
    let merged = 0;
    for (const vote of votes) {
      if (!isListenerVisitorId(vote.visitorId) || vote.value === 0) {
        continue;
      }
      await tx.vote.upsert({
        where: {
          visitorId_trackNumber_versionSlug_takeLabel_round: {
            visitorId: OWNER_VISITOR_ID,
            trackNumber: vote.trackNumber,
            versionSlug: vote.versionSlug,
            takeLabel: vote.takeLabel,
            round: vote.round,
          },
        },
        create: {
          visitorId: OWNER_VISITOR_ID,
          trackNumber: vote.trackNumber,
          versionSlug: vote.versionSlug,
          takeLabel: vote.takeLabel,
          value: vote.value,
          round: vote.round,
          detailsExposed: vote.detailsExposed,
        },
        update: {
          value: { increment: vote.value },
          ...(vote.detailsExposed ? { detailsExposed: true } : {}),
        },
      });
      merged += 1;
    }
    await tx.vote.deleteMany({ where: { visitorId: { in: ids } } });
    return merged;
  });
}
