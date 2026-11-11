import { describe, expect, it } from 'vitest';

import { keyPageCopy } from '@/lib/settings/key-copy';

describe('owner sign-in listener links', () => {
  it('sends public listeners to Listen when comparison requires the owner', () => {
    const copy = keyPageCopy({
      next: '/vote/prawnhub',
      visibility: 'public',
      listenerVoting: false,
      viewer: false,
    });
    expect(copy).toMatchObject({ listen: true, compare: false });
    expect(copy.listenerNote).toContain('Only the owner');
  });

  it('shows comparison to an eligible listener', () => {
    expect(
      keyPageCopy({ next: '/vote', visibility: 'public', listenerVoting: true, viewer: false })
    ).toMatchObject({ listen: true, compare: true });
  });

  it('points a private listener without access to their invitation', () => {
    const copy = keyPageCopy({
      next: '/vote',
      visibility: 'private',
      listenerVoting: true,
      viewer: false,
    });
    expect(copy).toMatchObject({ listen: false, compare: false });
    expect(copy.listenerNote).toContain('invitation');
    expect(
      keyPageCopy({ next: '/vote', visibility: 'private', listenerVoting: true, viewer: true })
    ).toMatchObject({ listen: true, compare: true, listenerNote: null });
  });
});
