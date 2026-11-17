import type { AlbumSettingsValue } from '@/lib/settings/schema';

export function canViewAlbum(): boolean {
  return true;
}

export function canCastVote(args: {
  listenerVoting: AlbumSettingsValue['listenerVoting'];
  owner: boolean;
}): boolean {
  return args.owner || args.listenerVoting;
}

export type ShareTarget = {
  grant: 'listen' | 'listen-and-vote';
  path: '/listen';
  invite: false;
};

export function shareTarget(listenerVoting: boolean): ShareTarget {
  if (listenerVoting) {
    return { grant: 'listen-and-vote', path: '/listen', invite: false };
  }
  return { grant: 'listen', path: '/listen', invite: false };
}
