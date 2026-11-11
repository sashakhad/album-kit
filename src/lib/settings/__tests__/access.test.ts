import { describe, expect, it } from 'vitest';

import { canCastVote, canViewAlbum, shareTarget } from '@/lib/settings/access';

describe('album access', () => {
  it('lets the owner see and vote in every visibility', () => {
    for (const visibility of ['unset', 'public', 'private'] as const) {
      expect(canViewAlbum(visibility, true, false)).toBe(true);
      expect(canCastVote({ visibility, listenerVoting: false, owner: true, viewer: false })).toBe(
        true
      );
    }
  });

  it('opens the home page and Listen to the public, and to invited viewers when private', () => {
    expect(canViewAlbum('public', false, false)).toBe(true);
    expect(canViewAlbum('private', false, true)).toBe(true);
    expect(canViewAlbum('private', false, false)).toBe(false);
    expect(canViewAlbum('unset', false, false)).toBe(false);
  });

  it('blocks non-owner votes while listener voting is off', () => {
    expect(
      canCastVote({ visibility: 'public', listenerVoting: false, owner: false, viewer: false })
    ).toBe(false);
    expect(
      canCastVote({ visibility: 'private', listenerVoting: false, owner: false, viewer: true })
    ).toBe(false);
    expect(
      canCastVote({ visibility: 'unset', listenerVoting: true, owner: false, viewer: false })
    ).toBe(false);
  });

  it('lets a public visitor vote only when listener voting is on', () => {
    expect(
      canCastVote({ visibility: 'public', listenerVoting: true, owner: false, viewer: false })
    ).toBe(true);
  });

  it('lets an invited viewer vote only when the album is private and listener voting is on', () => {
    expect(
      canCastVote({ visibility: 'private', listenerVoting: true, owner: false, viewer: true })
    ).toBe(true);
    expect(
      canCastVote({ visibility: 'private', listenerVoting: true, owner: false, viewer: false })
    ).toBe(false);
    expect(
      canCastVote({ visibility: 'public', listenerVoting: true, owner: false, viewer: true })
    ).toBe(true);
  });

  it('shares Listen, or Listen and Vote, without putting a secret in the path', () => {
    expect(shareTarget('unset', true)).toEqual({
      grant: 'unavailable',
      path: null,
      invite: false,
    });
    expect(shareTarget('public', false)).toEqual({
      grant: 'listen',
      path: '/listen',
      invite: false,
    });
    expect(shareTarget('public', true)).toEqual({
      grant: 'listen-and-vote',
      path: '/listen',
      invite: false,
    });
    expect(shareTarget('private', false)).toEqual({
      grant: 'listen',
      path: '/listen',
      invite: true,
    });
    expect(shareTarget('private', true)).toEqual({
      grant: 'listen-and-vote',
      path: '/listen',
      invite: true,
    });
  });
});
