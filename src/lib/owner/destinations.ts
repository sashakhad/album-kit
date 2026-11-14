/** Owner-only pages a one-tap link may open. /key is the sign-in page, not a destination. */
const OWNER_LINK_PAGES = [
  'settings',
  'vote',
  'listen',
  'final',
  'intake',
  'studio',
  'stats',
  'status',
] as const;

const OWNER_LINK_PATH = new RegExp(`^/(${OWNER_LINK_PAGES.join('|')})(/|$)`);

export function isOwnerLinkDestination(next: string): boolean {
  try {
    return OWNER_LINK_PATH.test(new URL(next, 'https://album.invalid').pathname);
  } catch {
    return false;
  }
}

export function ownerPageLabel(next: string): string {
  const path = next.split('?')[0] ?? next;
  if (path === '/stats' || path.startsWith('/stats/')) return 'model stats';
  if (path === '/status' || path.startsWith('/status/')) return 'progress';
  if (path === '/settings' || path.startsWith('/settings/')) return 'settings';
  if (path === '/intake' || path.startsWith('/intake/')) return 'uploads';
  if (path === '/studio' || path.startsWith('/studio/')) return 'studio';
  if (path === '/final' || path.startsWith('/final/')) return 'final picks';
  if (path === '/listen' || path.startsWith('/listen/')) return 'Listen';
  if (path === '/vote' || path.startsWith('/vote/')) return 'Compare takes';
  return 'this page';
}
