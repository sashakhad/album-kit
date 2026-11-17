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
describe('listener audio access', () => {
  it('allows listener audio when listener voting is on', async () => {
    expect(await canPlayBlindTake(new Request('http://localhost/audio'))).toBe(true);
  });
  it('blocks playback when listener voting is off unless the write token is present', async () => {
    state.listenerVoting = false;
    expect(await canPlayBlindTake(new Request('http://localhost/audio'))).toBe(false);
    state.owner = true;
    expect(await canPlayBlindTake(new Request('http://localhost/audio'))).toBe(true);
  });
  it('blocks playback when the signing key is missing', async () => {
    state.key = null;
    expect(await canPlayBlindTake(new Request('http://localhost/audio'))).toBe(false);
  });
});
