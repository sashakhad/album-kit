import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VoteButton } from '../VoteButton';

describe('VoteButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds another point every time the upvote button is clicked', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tallies: { 1: { v2: { B: 3 } } },
          mine: { 1: [{ versionSlug: 'v2', takeLabel: 'B', value: 1, round: 1 }] },
          downloads: {},
          versionTotals: { v2: 3 },
          currentRound: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tallies: { 1: { v2: { B: 4 } } },
          mine: { 1: [{ versionSlug: 'v2', takeLabel: 'B', value: 2, round: 1 }] },
          downloads: {},
          versionTotals: { v2: 4 },
          currentRound: 1,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <VoteButton
        trackNumber={1}
        versionSlug='v2'
        takeLabel='B'
        trackTitle='Track One'
        initialCount={2}
        initialValue={0}
      />
    );

    const upvote = screen.getByRole('button', { name: /add one to take b of track one/i });
    await user.click(upvote);
    await user.click(upvote);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/votes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ trackNumber: 1, versionSlug: 'v2', takeLabel: 'B', value: 1 }),
      })
    );
    expect(upvote).not.toHaveAttribute('aria-pressed');
    expect(screen.getByText('+4')).toBeInTheDocument();
  });

  it('subtracts another point every time the downvote button is clicked', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tallies: { 1: { v2: { A: -1 } } },
          mine: { 1: [{ versionSlug: 'v2', takeLabel: 'A', value: -1, round: 1 }] },
          downloads: {},
          versionTotals: { v2: -1 },
          currentRound: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tallies: { 1: { v2: { A: -2 } } },
          mine: { 1: [{ versionSlug: 'v2', takeLabel: 'A', value: -2, round: 1 }] },
          downloads: {},
          versionTotals: { v2: -2 },
          currentRound: 1,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <VoteButton
        trackNumber={1}
        versionSlug='v2'
        takeLabel='A'
        trackTitle='Track One'
        initialCount={0}
        initialValue={0}
      />
    );

    const downvote = screen.getByRole('button', { name: /subtract one from take a of track one/i });
    await user.click(downvote);
    await user.click(downvote);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/votes',
      expect.objectContaining({
        body: JSON.stringify({ trackNumber: 1, versionSlug: 'v2', takeLabel: 'A', value: -1 }),
      })
    );
    expect(downvote).not.toHaveAttribute('aria-pressed');
    expect(screen.getByText('−2')).toBeInTheDocument();
  });
});
