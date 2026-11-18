import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  getListenConfig: async () => ({ tracks: state.tracks }),
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
        audioUrl: 'https://cdn1.suno.ai/screenDoorTake.mp4',
        takes: [
          {
            label: 'A',
            filename: 'v1-01-screen-door-p1-takea.mp3',
            audioUrl: 'https://cdn1.suno.ai/screenDoorTake.mp4',
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

vi.mock('@/lib/owner/auth', () => ({ isOwner: async () => false }));
vi.mock('@/lib/votes/owner-view', () => ({ ownerJudgingView: vi.fn() }));
vi.mock('@/lib/votes/merge-ballot', () => ({ countBrowserListenerVotes: vi.fn() }));
vi.mock('@/lib/variations/status', () => ({ loadVariationTrackStatus: vi.fn() }));
vi.mock('@/lib/rounds/load-progress', async () => {
  const { idleProgress } = await import('@/lib/rounds/progress');
  return { loadAlbumProgress: async () => idleProgress() };
});
vi.mock('@/lib/votes/listener-view', async () => {
  const { getPublicListenVersion } = await import('@/lib/album/listen-store');
  const { EMPTY_VOTE_SNAPSHOT } = await import('@/lib/votes/types');
  return {
    listenerJudgingView: async () => ({
      version: await getPublicListenVersion(),
      votes: EMPTY_VOTE_SNAPSHOT,
      awaitingReveal: false,
    }),
  };
});

import { EMPTY_VOTE_SNAPSHOT } from '@/lib/votes/types';
import VotePage from '../vote/[[...parts]]/page';
import Home from '../page';

describe('home page', () => {
  beforeEach(() => {
    state.tracks = [{ number: 1, title: 'Screen Door', parked: false, slug: 'screen-door' }];
  });

  afterEach(() => vi.unstubAllGlobals());

  it('opens a shared Compare takes link directly and accepts a score', async () => {
    const submit = vi.fn().mockResolvedValue(
      Response.json({
        ...EMPTY_VOTE_SNAPSHOT,
        tallies: { 1: { v1: { A: 1 } } },
        mine: { 1: [{ versionSlug: 'v1', takeLabel: 'A', value: 1, round: 1 }] },
      })
    );
    vi.stubGlobal('fetch', submit);
    render(await VotePage({ params: Promise.resolve({ parts: ['screen-door'] }) }));

    expect(document.querySelector('video')?.getAttribute('src')).toBe(
      'https://cdn1.suno.ai/screenDoorTake.mp4'
    );
    expect(document.body.innerHTML).not.toMatch(/\/key|owner link|sign in as owner/i);
    expect(screen.queryByRole('link', { name: /sign in|owner/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate takes/i })).not.toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Add one to take A of Screen Door' })[0]!
    );
    await waitFor(() => expect(screen.getAllByLabelText('Score +1').length).toBeGreaterThan(0));
    expect(submit).toHaveBeenCalledWith(
      '/api/votes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ trackNumber: 1, versionSlug: 'v1', takeLabel: 'A', value: 1 }),
      })
    );
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
