import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UNPUBLISHED_ALBUM_MESSAGE } from '@/components/album/UnpublishedAlbum';

const state = vi.hoisted(() => ({
  owner: false,
  viewer: false,
  visibility: 'unset' as 'unset' | 'public' | 'private',
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));
vi.mock('@/lib/owner/auth', () => ({
  isOwner: async () => state.owner,
}));
vi.mock('@/lib/owner/viewer', () => ({
  isViewer: async () => state.viewer,
}));
vi.mock('@/lib/settings/store', () => ({
  loadSettings: async () => ({
    visibility: state.visibility,
    listenerVoting: false,
  }),
}));
vi.mock('@/lib/album/album-config', () => ({
  loadAlbumConfig: async () => ({
    title: 'Porch Light',
    artist: '',
    tracks: [{ number: 1, title: 'Screen Door', parked: false }],
  }),
}));

import Home from '../page';

describe('home page while visibility is unset', () => {
  beforeEach(() => {
    state.owner = false;
    state.viewer = false;
    state.visibility = 'unset';
  });

  it('explains that the album is not published yet', async () => {
    render(await Home());

    expect(screen.getByRole('heading', { name: UNPUBLISHED_ALBUM_MESSAGE })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('still shows the album to a signed-in owner', async () => {
    state.owner = true;
    state.visibility = 'unset';

    render(await Home());

    expect(screen.getByRole('heading', { name: 'Porch Light' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: UNPUBLISHED_ALBUM_MESSAGE })
    ).not.toBeInTheDocument();
  });

  it('keeps a private album hidden', async () => {
    state.visibility = 'private';

    await expect(Home()).rejects.toThrow('notFound');
  });

  it('shows a public album', async () => {
    state.visibility = 'public';

    render(await Home());

    expect(screen.getByRole('heading', { name: 'Porch Light' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Listen now' })).toHaveAttribute('href', '/listen');
  });
});
