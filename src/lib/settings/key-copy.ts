import { canViewAlbum } from '@/lib/settings/access';
import type { AlbumSettingsValue } from '@/lib/settings/schema';

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
