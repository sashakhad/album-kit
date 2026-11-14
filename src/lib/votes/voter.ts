import 'server-only';

import { albumKey, isOwnerRequest } from '@/lib/owner/auth';
import { isViewerRequest, viewerInviteIdFromRequest } from '@/lib/owner/viewer';
import { canCastVote } from '@/lib/settings/access';
import { loadSettings } from '@/lib/settings/store';
import { LISTENER_IDENTITIES_PER_HOUR, LISTENER_IDENTITIES_WINDOW_MS } from '@/lib/votes/abuse';
import { takeAttempt } from '@/lib/votes/attempt-log';
import {
  clientIp,
  inviteListenerVisitorId,
  ipHash,
  listenerCookieValue,
  listenerIdFromRequest,
  newListenerId,
  publicListenerVisitorId,
} from '@/lib/votes/listener-id';

export type ResolvedVoter =
  { kind: 'owner' } | { kind: 'listener'; visitorId: string; issuedCookie: string | null };

export async function resolveVoter(
  request: Request
): Promise<{ voter: ResolvedVoter } | { error: Response }> {
  if (albumKey() === null) {
    return { error: Response.json({ error: 'ALBUM_KEY is not set' }, { status: 503 }) };
  }
  if (await isOwnerRequest(request)) {
    return { voter: { kind: 'owner' } };
  }

  const settings = await loadSettings();
  const inviteId =
    settings.visibility === 'private' ? await viewerInviteIdFromRequest(request) : null;
  if (
    !canCastVote({
      visibility: settings.visibility,
      listenerVoting: settings.listenerVoting,
      owner: false,
      viewer: inviteId !== null,
    })
  ) {
    return { error: Response.json({ error: 'Owner password required' }, { status: 401 }) };
  }

  if (inviteId !== null) {
    return {
      voter: {
        kind: 'listener',
        visitorId: inviteListenerVisitorId(inviteId),
        issuedCookie: null,
      },
    };
  }

  const existing = listenerIdFromRequest(request);
  if (existing !== null) {
    return {
      voter: {
        kind: 'listener',
        visitorId: publicListenerVisitorId(existing),
        issuedCookie: null,
      },
    };
  }

  const allowed = await takeAttempt(
    `issue:${ipHash(clientIp(request))}`,
    LISTENER_IDENTITIES_WINDOW_MS,
    LISTENER_IDENTITIES_PER_HOUR
  );
  if (!allowed) {
    return {
      error: Response.json({ error: 'Too many new voters from this network' }, { status: 429 }),
    };
  }

  const id = newListenerId();
  return {
    voter: {
      kind: 'listener',
      visitorId: publicListenerVisitorId(id),
      issuedCookie: listenerCookieValue(id),
    },
  };
}

export async function canPlayBlindTake(request: Request): Promise<boolean> {
  if (albumKey() === null) {
    return false;
  }
  if (await isOwnerRequest(request)) {
    return true;
  }
  const settings = await loadSettings();
  const viewer = settings.visibility === 'private' ? await isViewerRequest(request) : false;
  return canCastVote({
    visibility: settings.visibility,
    listenerVoting: settings.listenerVoting,
    owner: false,
    viewer,
  });
}
