import { ownerPageLabel } from '@/lib/owner/destinations';
import { canViewAlbum } from '@/lib/settings/access';
import type { AlbumSettingsValue } from '@/lib/settings/schema';

export function ownerSignInPrompt(next: string): string {
  return `This page is for the album owner. Enter your owner password to open ${ownerPageLabel(next)}. This browser stays signed in. If you don’t remember the password, ask Album Bot to set a new one. You don’t need the old password.`;
}

export function keyPageCopy(args: {
  next: string;
  visibility: AlbumSettingsValue['visibility'];
  listenerVoting: boolean;
  viewer: boolean;
}): { listenerNote: string | null; listen: boolean; compare: boolean } {
  const listen = canViewAlbum(args.visibility, false, args.viewer);
  const compare = listen && args.listenerVoting;
  const fromCompare = args.next === '/vote' || args.next.startsWith('/vote/');
  return {
    listen,
    compare,
    listenerNote:
      args.visibility === 'private' && !args.viewer
        ? 'Here to listen? Open the invitation you received from the album owner.'
        : fromCompare && listen && !compare
          ? 'Only the owner can score takes. You can still open Listen.'
          : null,
  };
}
