import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlbumVersion } from '@/lib/album/types';

import { PASS_SLUG } from '@/lib/votes/pass';
import { EMPTY_VOTE_SNAPSHOT } from '@/lib/votes/types';

import { AlbumPlayer } from '../AlbumPlayer';

const sampleVersion: AlbumVersion = {
  slug: 'v1',
  folder: 'v1',
  title: 'Bubu',
  author: 'Bubu',
  blurb: 'First prompt set.',
  tracks: [
    {
      number: 1,
      title: 'Track One',
      kind: 'album',
      filename: '01-track-one.mp3',
      audioUrl: '/api/audio/v1/01-track-one.mp3',
      takes: [
        {
          label: 'A',
          filename: '01-track-one.mp3',
          audioUrl: '/api/audio/v1/01-track-one.mp3',
          versionSlug: 'v1',
          voteLabel: 'A',
        },
        {
          label: 'B',
          filename: '01-track-one-takeb.mp3',
          audioUrl: '/api/audio/v1/01-track-one-takeb.mp3',
          versionSlug: 'v1',
          voteLabel: 'B',
        },
      ],
      prompt: 'Warm and wide.',
    },
    {
      number: 2,
      title: 'Track Two',
      kind: 'album',
      filename: null,
      audioUrl: null,
      takes: [],
      prompt: 'Cold and dry.',
    },
    {
      number: 3,
      title: 'Track Three',
      kind: 'album',
      filename: '03-track-three.mp3',
      audioUrl: '/api/audio/v1/03-track-three.mp3',
      takes: [
        {
          label: 'A',
          filename: '03-track-three.mp3',
          audioUrl: '/api/audio/v1/03-track-three.mp3',
          versionSlug: 'v1',
          voteLabel: 'A',
        },
        {
          label: 'B',
          filename: '03-track-three-takeb.mp3',
          audioUrl: '/api/audio/v1/03-track-three-takeb.mp3',
          versionSlug: 'v1',
          voteLabel: 'B',
        },
      ],
      prompt: 'A room opening up.',
    },
  ],
};

const emptyVersion: AlbumVersion = {
  ...sampleVersion,
  tracks: sampleVersion.tracks.map(track => ({
    ...track,
    filename: null,
    audioUrl: null,
    takes: [],
  })),
};

describe('AlbumPlayer', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('renders the tracklist and prompt for the current song', () => {
    render(<AlbumPlayer version={sampleVersion} />);

    expect(screen.getByRole('heading', { name: 'Track One' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^01track one/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /track two/i })).toBeDisabled();
    expect(screen.getByText('Prompt · Take A')).toBeInTheDocument();
    expect(screen.getByText('Warm and wide.')).not.toBeVisible();
    expect(document.querySelector('[data-prompt]')).not.toHaveAttribute('open');
  });

  it('keeps the prompt below playback, closed initially, and open while switching takes', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} />);
    const prompt = document.querySelector('[data-prompt]')!;
    const controls = document.querySelector('[data-player-controls]')!;
    expect(
      controls.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(prompt).not.toHaveAttribute('open');
    await user.click(screen.getByText('Prompt · Take A'));
    expect(prompt).toHaveAttribute('open');
    await user.click(screen.getAllByRole('button', { name: 'Take B' })[0]!);
    expect(prompt).toHaveAttribute('open');
    expect(screen.getByText('Prompt · Take B')).toBeInTheDocument();
  });

  it('shows audio failures and lets the listener retry', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} />);
    fireEvent.error(audioElement());
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('plays a ready track when selected', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} />);

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('shows an upload hint when a version has no audio', () => {
    render(<AlbumPlayer version={emptyVersion} />);

    expect(screen.getByText(/no takes yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Intake' })).toHaveAttribute('href', '/intake');
    expect(screen.getByText('v1-01-track-one-p1-takea.mp3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('switches the current take', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} />);

    const takeB = screen.getAllByRole('button', { name: 'Take B' })[0];
    if (takeB === undefined) {
      throw new Error('expected a Take B button');
    }
    await user.click(takeB);

    expect(screen.getByText(/0[13] · Take B/)).toBeInTheDocument();
    expect(audioElement().getAttribute('src')).toBe('/api/audio/v1/01-track-one-takeb.mp3');
  });

  it('plays the next ready track when the current one ends', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} />);

    await user.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.ended(audioElement());

    expect(screen.getByRole('heading', { name: 'Track Three' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(audioElement().getAttribute('src')).toBe('/api/audio/v1/03-track-three.mp3');
  });

  it('plays the next variation when the current one ends in variations mode', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} />);

    await user.click(screen.getByRole('button', { name: 'Compare this track' }));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.ended(audioElement());

    expect(screen.getByRole('heading', { name: 'Track One' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next variation' })).toBeInTheDocument();
    expect(audioElement().getAttribute('src')).toBe('/api/audio/v1/01-track-one-takeb.mp3');
  });

  it('stops after the last variation finishes', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} />);

    await user.click(screen.getByRole('button', { name: 'Compare this track' }));
    await user.click(screen.getAllByRole('button', { name: 'Take B' })[0]!);
    fireEvent.ended(audioElement());

    expect(screen.getByRole('heading', { name: 'Track One' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('lets the listener switch back to album navigation', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} />);

    await user.click(screen.getByRole('button', { name: 'Compare this track' }));
    await user.click(screen.getByRole('button', { name: 'Next variation' }));
    expect(audioElement().getAttribute('src')).toBe('/api/audio/v1/01-track-one-takeb.mp3');

    await user.click(screen.getByRole('button', { name: 'Play album' }));
    await user.click(screen.getByRole('button', { name: 'Next track' }));
    expect(screen.getByRole('heading', { name: 'Track Three' })).toBeInTheDocument();
  });

  it('opens on the take named in the initial props', () => {
    render(<AlbumPlayer version={sampleVersion} initialTrackNumber={3} initialTakeLabel='B' />);

    expect(screen.getByRole('heading', { name: 'Track Three' })).toBeInTheDocument();
    expect(screen.getByText(/0[13] · Take B/)).toBeInTheDocument();
    expect(audioElement().getAttribute('src')).toBe('/api/audio/v1/03-track-three-takeb.mp3');
  });

  it('writes the song, set and take into the vote url', async () => {
    window.history.replaceState(null, '', '/vote');
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} />);

    const takeB = screen.getAllByRole('button', { name: 'Take B' })[0];
    if (takeB === undefined) {
      throw new Error('expected a Take B button');
    }
    await user.click(takeB);

    expect(window.location.pathname).toBe('/vote/track-one/v1/b');
  });

  it('writes only the song into the listen url', async () => {
    window.history.replaceState(null, '', '/listen');
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} surface='listen' />);

    await user.click(screen.getByRole('button', { name: /^03track three/i }));

    expect(window.location.pathname).toBe('/listen/track-three');
  });

  it('leaves the url alone off its own page', () => {
    window.history.replaceState(null, '', '/');
    render(<AlbumPlayer version={sampleVersion} />);

    expect(window.location.pathname).toBe('/');
  });

  it('stops after the last ready track', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} />);

    await user.click(screen.getByRole('button', { name: /^03track three/i }));
    fireEvent.ended(audioElement());

    expect(screen.getByRole('heading', { name: 'Track Three' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('shows the take letter on a never-voted singleton', () => {
    render(<AlbumPlayer version={singletonVersion} />);

    expect(screen.getByRole('heading', { name: 'Track Twenty-Four' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Take A' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/take A/i)).toBeInTheDocument();
    expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
  });

  it('keeps a take downvoted in the current round visible', () => {
    const oneOnly: AlbumVersion = {
      ...sampleVersion,
      tracks: sampleVersion.tracks.slice(0, 1),
    };
    render(
      <AlbumPlayer
        version={oneOnly}
        votes={{
          ...EMPTY_VOTE_SNAPSHOT,
          currentRound: 1,
          tallies: { 1: { v1: { A: -1, B: 2 } } },
          mine: { 1: [{ versionSlug: 'v1', takeLabel: 'A', value: -1, round: 1 }] },
        }}
      />
    );

    expect(screen.getAllByRole('button', { name: 'Take A' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Take B' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('−1').length).toBeGreaterThan(0);
  });

  it('keeps showing a score from an earlier round', () => {
    const oneOnly: AlbumVersion = {
      ...sampleVersion,
      tracks: sampleVersion.tracks.slice(0, 1),
    };
    render(
      <AlbumPlayer
        version={oneOnly}
        votes={{
          ...EMPTY_VOTE_SNAPSHOT,
          currentRound: 10,
          tallies: { 1: { v1: { A: -2, B: 1 } } },
          mine: { 1: [{ versionSlug: 'v1', takeLabel: 'A', value: -2, round: 9 }] },
        }}
      />
    );

    expect(screen.getAllByRole('button', { name: 'Take A' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('−2').length).toBeGreaterThan(0);
  });

  it('shows the round controls on the vote surface', () => {
    render(
      <AlbumPlayer version={passVersion} votes={{ ...EMPTY_VOTE_SNAPSHOT, currentRound: 2 }} />
    );

    fireEvent.click(screen.getByText('Round 2 · Manage round'));
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next round' })).toBeInTheDocument();
  });

  it('names parked takes on the round without putting them on the shortlist', () => {
    const track = passVersion.tracks[0];
    const keeper = track?.takes[0];
    if (track === undefined || keeper === undefined) {
      throw new Error('expected a pass track');
    }

    render(
      <AlbumPlayer
        version={{
          ...passVersion,
          tracks: [
            {
              ...track,
              takes: [keeper],
              parkedTakes: [
                {
                  label: 'D',
                  filename: 'v1-11-track-eleven-p2-taked.mp3',
                  audioUrl: '/d.mp3',
                  versionSlug: 'v1',
                  voteLabel: 'D',
                },
              ],
            },
          ],
        }}
      />
    );

    expect(screen.getByText('Possible renames')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.getByText('1 take parked under Possible renames.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take D' })).not.toBeInTheDocument();
  });

  it('keeps a fully parked track off the shortlist and under Possible renames', async () => {
    const user = userEvent.setup();
    render(
      <AlbumPlayer
        version={{
          ...passVersion,
          tracks: [
            {
              number: 21,
              title: 'Track Twenty-One',
              kind: 'album',
              filename: null,
              audioUrl: null,
              takes: [],
              parkedTakes: [
                {
                  label: 'F',
                  filename: 'v1-21-track-twenty-one-p3-takef.mp3',
                  audioUrl: '/twenty-one-f.mp3',
                  versionSlug: 'v1',
                  voteLabel: 'F',
                },
              ],
              prompt: null,
            },
          ],
        }}
      />
    );

    expect(screen.getByText('Possible renames')).toBeInTheDocument();
    expect(screen.getByText('F')).toBeInTheDocument();
    expect(screen.queryByText('Waiting')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^21track twenty-onef/i }));

    expect(screen.getByRole('heading', { name: 'Track Twenty-One' })).toBeInTheDocument();
    expect(audioElement().getAttribute('src')).toBe('/twenty-one-f.mp3');
  });

  it('plays variations from different sets without leaving the round track', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={passVersion} />);

    await user.click(screen.getByRole('button', { name: 'Compare this track' }));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.ended(audioElement());

    expect(screen.getByRole('heading', { name: 'Track Eleven' })).toBeInTheDocument();
    expect(audioElement().getAttribute('src')).toBe('/b.mp3');
  });

  it('hides votes on Listen', () => {
    render(<AlbumPlayer version={passVersion} surface='listen' />);

    expect(screen.queryByRole('button', { name: /upvote/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /downvote/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Next round/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Take / })).not.toBeInTheDocument();
    expect(screen.queryByText(/Bubu C/)).not.toBeInTheDocument();
  });
});

const singletonVersion: AlbumVersion = {
  slug: 'v1',
  folder: 'v1',
  title: 'Bubu',
  author: 'Bubu',
  blurb: 'First prompt set.',
  tracks: [
    {
      number: 24,
      title: 'Track Twenty-Four',
      kind: 'album',
      filename: 'v1-24-track-twenty-four-p1-takea.mp3',
      audioUrl: '/twenty-four.mp3',
      takes: [
        {
          label: 'A',
          filename: 'v1-24-track-twenty-four-p1-takea.mp3',
          audioUrl: '/twenty-four.mp3',
          versionSlug: 'v1',
          voteLabel: 'A',
        },
      ],
      prompt: null,
    },
  ],
};

const passVersion: AlbumVersion = {
  slug: PASS_SLUG,
  folder: 'pass',
  title: 'Round 2',
  author: '',
  blurb: 'Earlier downvotes are out.',
  tracks: [
    {
      number: 11,
      title: 'Track Eleven',
      kind: 'album',
      filename: 'v1-11-track-eleven-p1-takec.mp3',
      audioUrl: '/c.mp3',
      takes: [
        {
          label: 'A',
          filename: 'v1-11-track-eleven-p1-takec.mp3',
          audioUrl: '/c.mp3',
          versionSlug: 'v1',
          voteLabel: 'C',
        },
        {
          label: 'B',
          filename: 'v2-11-track-eleven-p1-takeb.mp3',
          audioUrl: '/b.mp3',
          versionSlug: 'v2',
          voteLabel: 'B',
        },
      ],
      prompt: null,
    },
  ],
};

function audioElement(): HTMLAudioElement {
  const audio = document.querySelector('audio');
  if (audio === null) {
    throw new Error('expected an audio element');
  }
  return audio;
}
