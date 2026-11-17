import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tracks: [{ number: 1, title: 'Screen Door', parked: false, slug: 'screen-door' }] as Array<{
    number: number;
    title: string;
    parked: boolean;
    slug: string;
  }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/settings/store', () => ({
  loadSettings: async () => ({
    listeningDetails: 'visible',
    maskPromptModels: false,
    listenerVoting: false,
  }),
}));
vi.mock('@/lib/album/album-config', () => ({
  loadAlbumConfig: async () => ({
    title: 'Porch Light',
    artist: '',
    tracks: state.tracks,
  }),
}));
vi.mock('@/lib/album/listen-store', () => ({
  getPublicListenVersion: async () => ({
    slug: 'listen',
    folder: 'listen',
    title: 'Porch Light',
    author: '',
    blurb: '',
    tracks: [
      {
        number: 1,
        title: 'Screen Door',
        kind: 'album',
        filename: 'v1-01-screen-door-p1-takea.mp3',
        audioUrl: '/api/audio/v1/v1-01-screen-door-p1-takea.mp3',
        takes: [
          {
            label: 'A',
            filename: 'v1-01-screen-door-p1-takea.mp3',
            audioUrl: '/api/audio/v1/v1-01-screen-door-p1-takea.mp3',
            versionSlug: 'v1',
            voteLabel: 'A',
          },
        ],
        parkedTakes: [],
        prompt: null,
        status: 'preview',
      },
    ],
  }),
}));
vi.mock('@/lib/votes/provenance', () => ({
  withVisibleDetails: async (version: unknown) => version,
}));

import Home from '../page';

describe('home page', () => {
  beforeEach(() => {
    state.tracks = [{ number: 1, title: 'Screen Door', parked: false, slug: 'screen-door' }];
  });

  it('plays ready takes on the home page', async () => {
    render(await Home());

    expect(screen.getByRole('heading', { name: 'Porch Light' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compare takes' })).toHaveAttribute('href', '/vote');
    expect(document.querySelector('audio, video')).not.toBeNull();
  });

  it('shows an empty album without a player', async () => {
    state.tracks = [];

    render(await Home());

    expect(screen.getByText(/this album is empty/i)).toBeInTheDocument();
    expect(document.querySelector('audio, video')).toBeNull();
  });
});
