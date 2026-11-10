import type { AlbumSettingsValue } from '@/lib/settings/schema';

export type KeyPageCopy = {
  title: string;
  paragraphs: string[];
  listenHref: '/listen' | null;
  voteHref: '/vote' | null;
};

export function keyPageCopy(args: {
  next: string;
  visibility: AlbumSettingsValue['visibility'];
  listenerVoting: boolean;
}): KeyPageCopy {
  const fromVote = args.next === '/vote' || args.next.startsWith('/vote/');
  const paragraphs = [
    fromVote
      ? 'You opened a voting link. This page is where the album owner signs in.'
      : 'This page is where the album owner signs in.',
    'The album key is how the owner scores takes, uploads audio, and moves takes. Studio and Settings use the same key.',
  ];

  if (args.visibility === 'unset') {
    paragraphs.push(
      'The owner has not shared this album yet. The home page and Listen stay closed.'
    );
    return { title: 'Album key', paragraphs, listenHref: null, voteHref: null };
  }

  if (args.listenerVoting && args.visibility === 'public') {
    paragraphs.push(
      'Listener voting is on. Anyone can score takes on Vote without this key. Those scores stay on a separate ballot from the owner.'
    );
    paragraphs.push('Pinned takes play on Listen.');
    return { title: 'Album key', paragraphs, listenHref: '/listen', voteHref: '/vote' };
  }

  if (args.listenerVoting && args.visibility === 'private') {
    paragraphs.push(
      'Listener voting is on for people with an invitation. Open the invitation link the owner sent. The secret is the part after #, and it is separate from this key. Vote then accepts your scores.'
    );
    paragraphs.push('Pinned takes play on Listen after the invitation is open.');
    return { title: 'Album key', paragraphs, listenHref: '/listen', voteHref: '/vote' };
  }

  paragraphs.push(
    'Listener voting is off. Only the owner scores takes. Everyone else can hear pinned takes on Listen when the album is public, or with an invitation when it is private.'
  );
  if (fromVote) {
    paragraphs.push(
      'A vote link brings other people here while listener voting is off. The owner can turn it on in Settings.'
    );
  }
  return { title: 'Album key', paragraphs, listenHref: '/listen', voteHref: null };
}
