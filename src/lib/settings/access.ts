import type { AlbumSettingsValue } from '@/lib/settings/schema';

export function canViewAlbum(
  visibility: AlbumSettingsValue['visibility'],
  owner: boolean,
  viewer = false
): boolean {
  return owner || visibility === 'public' || (visibility === 'private' && viewer);
}

export function canCastVote(args: {
  visibility: AlbumSettingsValue['visibility'];
  listenerVoting: boolean;
  owner: boolean;
  viewer: boolean;
}): boolean {
  if (args.owner) {
    return true;
  }
  if (!args.listenerVoting || args.visibility === 'unset') {
    return false;
  }
  if (args.visibility === 'public') {
    return true;
  }
  return args.viewer;
}

export type ShareTarget = {
  grant: 'unavailable' | 'listen' | 'listen-and-vote';
  path: '/listen' | '/vote' | null;
  invite: boolean;
};

export function shareTarget(
  visibility: AlbumSettingsValue['visibility'],
  listenerVoting: boolean
): ShareTarget {
  if (visibility === 'unset') {
    return { grant: 'unavailable', path: null, invite: false };
  }
  if (listenerVoting) {
    return { grant: 'listen-and-vote', path: '/listen', invite: visibility === 'private' };
  }
  return { grant: 'listen', path: '/listen', invite: visibility === 'private' };
}
