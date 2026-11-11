// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  owner: false,
  viewer: false,
  key: 'secret' as string | null,
  visibility: 'public',
  listenerVoting: true,
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({
  albumKey: () => state.key,
  isOwnerRequest: () => state.owner,
}));
vi.mock('@/lib/owner/viewer', () => ({
  isViewerRequest: async () => state.viewer,
  viewerInviteIdFromRequest: async () => (state.viewer ? 'invite' : null),
}));
vi.mock('@/lib/settings/store', () => ({ loadSettings: async () => state }));
vi.mock('@/lib/votes/attempt-log', () => ({ takeAttempt: async () => true }));
import { canPlayBlindTake } from '../voter';
beforeEach(() =>
  Object.assign(state, {
    owner: false,
    viewer: false,
    key: 'secret',
    visibility: 'public',
    listenerVoting: true,
  })
);
describe('opaque listener audio access', () => {
  it('allows public listener audio without a ballot or blind session', async () => {
    expect(await canPlayBlindTake(new Request('http://localhost/audio'))).toBe(true);
  });
  it('requires an invitation for private audio', async () => {
    state.visibility = 'private';
    expect(await canPlayBlindTake(new Request('http://localhost/audio'))).toBe(false);
    state.viewer = true;
    expect(await canPlayBlindTake(new Request('http://localhost/audio'))).toBe(true);
  });
  it('blocks previews when listener voting is disabled, including invite holders', async () => {
    state.listenerVoting = false;
    expect(await canPlayBlindTake(new Request('http://localhost/audio'))).toBe(false);
    state.visibility = 'private';
    state.viewer = true;
    expect(await canPlayBlindTake(new Request('http://localhost/audio'))).toBe(false);
    state.owner = true;
    expect(await canPlayBlindTake(new Request('http://localhost/audio'))).toBe(true);
  });
  it('blocks unset albums and missing credentials', async () => {
    state.visibility = 'unset';
    expect(await canPlayBlindTake(new Request('http://localhost/audio'))).toBe(false);
    state.owner = true;
    state.key = null;
    expect(await canPlayBlindTake(new Request('http://localhost/audio'))).toBe(false);
  });
});
