import { describe, expect, it } from 'vitest';

import { canCastVote, canViewAlbum, shareTarget } from '@/lib/settings/access';

describe('album access', () => {
  it('lets anyone open the album', () => {
    expect(canViewAlbum()).toBe(true);
  });

  it('lets the write token score, and listeners only when that setting is on', () => {
    expect(canCastVote({ listenerVoting: false, owner: true })).toBe(true);
    expect(canCastVote({ listenerVoting: false, owner: false })).toBe(false);
    expect(canCastVote({ listenerVoting: true, owner: false })).toBe(true);
  });

  it('shares Listen without an invitation', () => {
    expect(shareTarget(false)).toEqual({ grant: 'listen', path: '/listen', invite: false });
    expect(shareTarget(true)).toEqual({
      grant: 'listen-and-vote',
      path: '/listen',
      invite: false,
    });
  });
});
