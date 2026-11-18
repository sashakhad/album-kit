import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearEmbeddedUrls } from '@/lib/album/embedded-audio';
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
    window.localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clearEmbeddedUrls();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
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

  it('shows the generation prompt over revised sheet text and labels sheet-only text', async () => {
    const user = userEvent.setup();
    const track = sampleVersion.tracks[0]!;
    render(
      <AlbumPlayer
        version={{
          ...sampleVersion,
          tracks: [
            {
              ...track,
              takes: [
                {
                  ...track.takes[0]!,
                  prompt: 'Revised sheet text',
                  details: {
                    style: 'Recorded generation text',
                    writer: 'Grok Bot · model undisclosed',
                    sunoModel: 'v6',
                    promptSource: 'generation',
                  },
                },
                {
                  ...track.takes[1]!,
                  prompt: 'Sheet-only text',
                  details: {
                    style: 'Prompt record unavailable',
                    writer: 'Writer unverified',
                    sunoModel: 'Suno model unverified',
                    promptSource: 'sheet',
                  },
                },
              ],
            },
          ],
        }}
      />
    );
    expect(screen.getByText('Recorded generation text')).toBeInTheDocument();
    expect(screen.queryByText('Revised sheet text')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Take B' })[0]!);
    expect(screen.getByText('Sheet prompt (unverified) · Take B')).toBeInTheDocument();
    expect(screen.getByText('Sheet-only text')).toBeInTheDocument();
  });

  it('shows audio failures and lets the listener retry', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} />);
    fireEvent.error(audioElement());
    expect(screen.getByRole('alert')).toHaveTextContent('MediaError');
    expect(screen.getByRole('alert')).toHaveTextContent('/api/audio/v1/01-track-one.mp3');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the MediaError and stream URL when a sandboxed viewer blocks playback', async () => {
    const user = userEvent.setup();
    const mp4 = 'https://cdn1.suno.ai/clip-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4';
    const safety = {
      code: 4,
      message: 'MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check',
    };
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(
      this: HTMLMediaElement
    ) {
      Object.defineProperty(this, 'error', { configurable: true, value: safety });
      this.dispatchEvent(new Event('error'));
      return Promise.reject(new DOMException('No supported source', 'NotSupportedError'));
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    render(
      <AlbumPlayer
        version={{
          ...sampleVersion,
          tracks: [
            {
              number: 1,
              title: 'Track One',
              kind: 'album',
              filename: '01-track-one.mp3',
              audioUrl: mp4,
              takes: [
                {
                  label: 'A',
                  filename: '01-track-one.mp3',
                  audioUrl: mp4,
                  versionSlug: 'v1',
                  voteLabel: 'A',
                },
              ],
              prompt: 'Warm and wide.',
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Play' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('MediaError 4');
    expect(alert).toHaveTextContent(safety.message);
    expect(alert).toHaveTextContent(mp4);
    expect(alert).toHaveTextContent('Failed to fetch');
  });

  it('plays inlined audio on one tap when the viewer blocks the CDN and fetch', async () => {
    const user = userEvent.setup();
    const mp4 = 'https://cdn1.suno.ai/clip-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4';
    const safety = {
      code: 4,
      message: 'MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check',
    };
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(
      this: HTMLMediaElement
    ) {
      const src = this.getAttribute('src') ?? '';
      if (src.startsWith('blob:')) return Promise.resolve();
      Object.defineProperty(this, 'error', { configurable: true, value: safety });
      this.dispatchEvent(new Event('error'));
      return Promise.reject(new DOMException('No supported source', 'NotSupportedError'));
    });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchImpl);
    render(
      <AlbumPlayer
        surface='listen'
        version={{
          ...sampleVersion,
          tracks: [
            {
              number: 1,
              title: 'Track One',
              kind: 'album',
              filename: '01-track-one.mp3',
              audioUrl: mp4,
              takes: [
                {
                  label: 'A',
                  filename: '01-track-one.mp3',
                  audioUrl: mp4,
                  embeddedAudio: { mime: 'audio/mp4', base64: btoa('inline-audio') },
                  versionSlug: 'v1',
                  voteLabel: 'A',
                },
              ],
              prompt: 'Warm and wide.',
            },
          ],
        }}
      />
    );

    const audio = document.querySelector('audio');
    expect(audio?.getAttribute('src')?.startsWith('blob:')).toBe(true);
    expect(audio?.getAttribute('src')).not.toContain('cdn1.suno.ai');
    expect(screen.queryByText('Internet required')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Play album' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('plays a ready track when selected', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} />);

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('plays a public Suno MP4 in the same player with the picture hidden', async () => {
    const user = userEvent.setup();
    const mp4 = 'https://cdn1.suno.ai/clip-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4';
    const version: AlbumVersion = {
      ...sampleVersion,
      tracks: [
        {
          number: 1,
          title: 'Track One',
          kind: 'album',
          filename: '01-track-one.mp3',
          audioUrl: mp4,
          takes: [
            {
              label: 'A',
              filename: '01-track-one.mp3',
              audioUrl: mp4,
              versionSlug: 'v1',
              voteLabel: 'A',
            },
          ],
          prompt: 'Warm and wide.',
        },
      ],
    };
    render(<AlbumPlayer version={version} />);

    const video = document.querySelector('video');
    if (video === null) {
      throw new Error('expected a video element');
    }
    expect(video).toHaveAttribute('src', mp4);
    expect(video).not.toHaveAttribute('controls');
    expect(video.className).toContain('opacity-0');
    expect(video.className).toContain('h-px');
    expect(video.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('audio')).not.toHaveAttribute('src');
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument();

    expect(screen.getByText('Internet required')).toBeInTheDocument();
    expect(screen.queryByText(/public Suno link|anyone with that link/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    Object.defineProperty(video, 'duration', { configurable: true, value: 80 });
    fireEvent.durationChange(video);
    const slider = screen.getByRole('slider', { name: 'Seek' });
    expect(slider).toHaveAttribute('aria-valuemax', '80');
    slider.setPointerCapture = () => undefined;
    slider.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 200,
        top: 0,
        height: 44,
        right: 200,
        bottom: 44,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1, buttons: 1 });
    expect(video.currentTime).toBe(40);
    expect(slider).toHaveAttribute('aria-valuenow', '40');
  });

  it('shows an upload hint when a version has no audio', () => {
    render(<AlbumPlayer version={emptyVersion} />);

    expect(screen.getByText(/no takes to compare yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'upload takes' })).toHaveAttribute('href', '/intake');
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

  it('does not offer a download control on vote or listen', () => {
    const track = sampleVersion.tracks[0]!;
    const version: AlbumVersion = {
      ...sampleVersion,
      tracks: [
        {
          ...track,
          parkedTakes: [
            {
              label: 'D',
              filename: '01-track-one-taked.mp3',
              audioUrl: '/api/audio/v1/01-track-one-taked.mp3',
              versionSlug: 'v1',
              voteLabel: 'D',
            },
          ],
        },
        ...sampleVersion.tracks.slice(1),
      ],
    };
    const { rerender } = render(<AlbumPlayer version={version} surface='vote' voter='owner' />);
    expect(screen.queryByRole('button', { name: /save take/i })).not.toBeInTheDocument();
    rerender(<AlbumPlayer version={version} surface='listen' voter='owner' />);
    expect(screen.queryByRole('button', { name: /save take/i })).not.toBeInTheDocument();
    rerender(<AlbumPlayer version={version} surface='vote' voter='listener' />);
    expect(screen.queryByRole('button', { name: /save take/i })).not.toBeInTheDocument();
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
    expect(screen.getByText('24 · Take A')).toBeInTheDocument();
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

    expect(screen.getByRole('heading', { name: 'Pass 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review next pass' }));
    expect(screen.getByRole('button', { name: 'Confirm pass 3' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Confirm pass 3' })).not.toBeInTheDocument();
  });

  it('states only the pass count, then a cut when a score is negative', async () => {
    const user = userEvent.setup();
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
    const takes = labels.map(label => ({
      label,
      filename: `v1-01-six-p1-take${label.toLowerCase()}.mp3`,
      audioUrl: `/api/audio/${label}.mp3`,
      versionSlug: 'v1',
      voteLabel: label,
    }));
    const six: AlbumVersion = {
      ...sampleVersion,
      tracks: [
        {
          number: 1,
          title: 'First song',
          kind: 'album',
          filename: takes[0]?.filename ?? null,
          audioUrl: takes[0]?.audioUrl ?? null,
          takes: [...takes],
          prompt: null,
        },
      ],
    };
    const choice = (takeLabel: string, value: number, round: number) => ({
      versionSlug: 'v1',
      takeLabel,
      value,
      round,
    });
    const { rerender } = render(
      <AlbumPlayer key='pass-1' version={six} votes={EMPTY_VOTE_SNAPSHOT} />
    );

    expect(screen.getByText('6 unscored takes')).toBeInTheDocument();
    expect(
      screen.queryByText(/Only negative|dropped|Positive scores|parked takes/i)
    ).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-inline-vote]')).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: 'Review next pass' }));
    expect(screen.getByText('Start Pass 2? No takes will be cut.')).toBeInTheDocument();

    rerender(
      <AlbumPlayer
        key='mixed'
        version={six}
        votes={{
          ...EMPTY_VOTE_SNAPSHOT,
          tallies: { 1: { v1: { A: -1, B: -1, C: 2, D: 0 } } },
          mine: {
            1: [choice('A', -1, 1), choice('B', -1, 1), choice('C', 2, 1), choice('D', 0, 1)],
          },
        }}
      />
    );
    expect(screen.getByText('2 takes will be cut · 2 unscored takes')).toBeInTheDocument();
    expect(screen.getByText('Cut when next pass starts')).toBeInTheDocument();

    const kept = takes.filter(take => take.label !== 'A' && take.label !== 'B');
    const track = six.tracks[0];
    if (track === undefined) {
      throw new Error('expected the six-take track');
    }
    rerender(
      <AlbumPlayer
        key='pass-2'
        version={{ ...six, tracks: [{ ...track, takes: kept }] }}
        votes={{
          ...EMPTY_VOTE_SNAPSHOT,
          currentRound: 2,
          tallies: { 1: { v1: { C: 2, D: 0, E: 1, F: 0 } } },
          mine: {
            1: [choice('C', 2, 2), choice('D', 0, 2), choice('E', 1, 2), choice('F', 0, 2)],
          },
        }}
      />
    );
    expect(screen.getByRole('heading', { name: 'Pass 2' })).toBeInTheDocument();
    expect(screen.getByText('4 scored takes')).toBeInTheDocument();
    expect(screen.queryByText(/public Suno|internet required/i)).not.toBeInTheDocument();
  });

  it('scores another take without stopping the one that is playing', async () => {
    const user = userEvent.setup();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...EMPTY_VOTE_SNAPSHOT,
          tallies: { 1: { v1: { A: 0, B: 1 } } },
          mine: { 1: [{ versionSlug: 'v1', takeLabel: 'B', value: 1, round: 1 }] },
        }),
      })
    );
    render(<AlbumPlayer version={sampleVersion} votes={EMPTY_VOTE_SNAPSHOT} />);
    await user.click(screen.getByRole('button', { name: 'Play' }));
    pause.mockClear();
    const chip = document.querySelector('[data-take-chip] [data-inline-vote]');
    const addB = [...document.querySelectorAll('[data-inline-vote] button')].find(button =>
      button.getAttribute('aria-label')?.includes('take B')
    );
    expect(chip).toBeTruthy();
    if (!(addB instanceof HTMLButtonElement)) {
      throw new Error('expected an inline score for take B');
    }
    await user.click(addB);
    expect(pause).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Track One' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('keeps voting beside the selected player and labels its model and cut status', async () => {
    const user = userEvent.setup();
    const track = sampleVersion.tracks[0]!;
    const take = track.takes[0]!;
    render(
      <AlbumPlayer
        version={{
          ...sampleVersion,
          tracks: [
            {
              ...track,
              takes: [
                {
                  ...take,
                  details: { style: 'Warm and wide.', writer: 'OpenAI · model-x', sunoModel: 'v6' },
                },
                track.takes[1]!,
              ],
            },
          ],
        }}
        votes={{
          ...EMPTY_VOTE_SNAPSHOT,
          tallies: { 1: { v1: { A: -1 } } },
          mine: { 1: [{ versionSlug: 'v1', takeLabel: 'A', value: -1, round: 1 }] },
        }}
      />
    );
    expect(screen.getByText('OpenAI · model-x')).toBeInTheDocument();
    expect(screen.getByText('Cut when next pass starts')).toBeInTheDocument();
    expect(document.querySelector('[data-active-vote]')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Add one to take A/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Add one to take B/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Take B' }));
    expect(screen.getAllByRole('button', { name: /Add one to take B/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Add one to take A/ })).toHaveLength(1);
    expect(screen.queryByText('OpenAI · model-x')).not.toBeInTheDocument();
  });

  it('offers a visible owner a variation request even when old take provenance is missing', () => {
    const track = sampleVersion.tracks[0]!;
    render(
      <AlbumPlayer
        version={{
          ...sampleVersion,
          tracks: [
            {
              ...track,
              takes: [
                {
                  ...track.takes[0]!,
                  filename: 'v1-01-track-one-p1-takea.mp3',
                },
              ],
            },
          ],
        }}
        surface='vote'
        voter='owner'
        canRequestVariations
      />
    );
    expect(screen.getByRole('button', { name: 'More like this' })).toBeInTheDocument();
  });

  it('offers a blind owner an opaque variation request but keeps it off listener ballots', () => {
    const track = sampleVersion.tracks[0]!;
    const hiddenVersion = {
      ...sampleVersion,
      tracks: [
        {
          ...track,
          prompt: null,
          takes: [
            {
              label: 'Q',
              filename: 'a'.repeat(32),
              audioUrl: '/api/blind-audio/1/opaque',
              versionSlug: 'v1',
              voteLabel: 'Q',
            },
          ],
        },
      ],
    };
    const { rerender } = render(
      <AlbumPlayer
        version={hiddenVersion}
        surface='vote'
        voter='owner'
        canRequestVariations
        variationBlindRound={1}
      />
    );
    expect(screen.getByRole('button', { name: 'More like this' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('v1-01-track-one-p1-takea.mp3');
    rerender(
      <AlbumPlayer
        version={hiddenVersion}
        surface='vote'
        voter='listener'
        canRequestVariations
        variationBlindRound={1}
      />
    );
    expect(screen.queryByRole('button', { name: 'More like this' })).not.toBeInTheDocument();
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
    expect(screen.getByText('Take D')).toBeInTheDocument();
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
    expect(screen.getByText('Take F')).toBeInTheDocument();
    expect(screen.queryByText('Waiting')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^21track twenty-onetake f/i }));

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

  it('shows listener scores to the owner when listener voting is off', () => {
    render(
      <AlbumPlayer
        version={sampleVersion}
        voter='owner'
        showListenerScores={false}
        votes={{
          ...EMPTY_VOTE_SNAPSHOT,
          listenerTallies: { 1: { v1: { A: 4 } } },
        }}
      />
    );

    expect(screen.getByLabelText('Listener votes +4 for take A')).toBeInTheDocument();
    expect(screen.getByText('Listeners +4')).toBeInTheDocument();
  });

  it('keeps other listener scores off a listener ballot', () => {
    render(
      <AlbumPlayer
        version={sampleVersion}
        voter='listener'
        votes={{
          ...EMPTY_VOTE_SNAPSHOT,
          listenerTallies: { 1: { v1: { A: 4 } } },
        }}
      />
    );

    expect(screen.queryByText('listeners')).not.toBeInTheDocument();
  });

  it('hides votes on Listen', () => {
    render(<AlbumPlayer version={passVersion} surface='listen' />);

    expect(screen.queryByRole('button', { name: /upvote/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /downvote/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start round/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take B' })).toBeInTheDocument();
    expect(screen.queryByText(/Bubu C/)).not.toBeInTheDocument();
  });

  it('plays a listen track on the first tap', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} surface='listen' />);

    await user.click(screen.getByRole('button', { name: /^01track one/i }));

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(audioElement().getAttribute('src')).toBe('/api/audio/v1/01-track-one.mp3');
  });

  it('plays another take on listen with one tap', async () => {
    const user = userEvent.setup();
    render(<AlbumPlayer version={sampleVersion} surface='listen' />);

    await user.click(screen.getAllByRole('button', { name: 'Take B' })[1]!);

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Track Three' })).toBeInTheDocument();
    expect(audioElement().getAttribute('src')).toBe('/api/audio/v1/03-track-three-takeb.mp3');
  });

  it('follows album media keys and arrow keys on listen', () => {
    const handlers = new Map<string, (() => void) | null>();
    Object.defineProperty(window.navigator, 'mediaSession', {
      configurable: true,
      value: {
        metadata: null as MediaMetadata | null,
        playbackState: 'none',
        setActionHandler(name: string, handler: (() => void) | null) {
          handlers.set(name, handler);
        },
      },
    });
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(data: MediaMetadataInit) {
          Object.assign(this, data);
        }
      }
    );
    try {
      render(<AlbumPlayer version={sampleVersion} surface='listen' />);

      expect(handlers.get('play')).toEqual(expect.any(Function));
      expect(handlers.get('nexttrack')).toEqual(expect.any(Function));
      fireEvent.keyDown(window, { key: ' ' });
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
      act(() => {
        handlers.get('nexttrack')?.();
      });
      expect(screen.getByRole('heading', { name: 'Track Three' })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByRole('heading', { name: 'Track One' })).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(window.navigator, 'mediaSession');
    }
  });

  it('keeps Listen pins and the listeners corner off the track card', () => {
    const track = sampleVersion.tracks[0];
    if (track === undefined) {
      throw new Error('expected a track');
    }
    render(
      <AlbumPlayer
        version={{ ...sampleVersion, tracks: [track] }}
        voter='owner'
        listenChoices={{
          1: { manual: true, token: track.takes[0]?.filename ?? null, hasBonus: false },
        }}
        votes={{
          ...EMPTY_VOTE_SNAPSHOT,
          tallies: { 1: { v1: { A: 2, B: 0 } } },
          listenerTallies: { 1: { v1: { A: 0, B: 1 } } },
        }}
      />
    );

    const row = document.querySelector('[data-track-row]');
    if (!(row instanceof HTMLElement)) {
      throw new Error('expected a track card');
    }
    expect(within(row).queryByText('On Listen')).not.toBeInTheDocument();
    expect(within(row).queryByText(/preview on listen/i)).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /on listen/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /follow scores/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /save take/i })).not.toBeInTheDocument();
    expect(within(row).getByText('0 of 2 scored')).toBeInTheDocument();
    expect(within(row).queryByText('Listeners 0')).not.toBeInTheDocument();
    expect(within(row).getByText('Listeners +1')).toBeInTheDocument();
    expect(within(row).queryByText(/^listeners$/i)).not.toBeInTheDocument();
  });

  it('scores from a take chip and the player panel in sync', async () => {
    const user = userEvent.setup();
    const track = sampleVersion.tracks[0];
    if (track === undefined) {
      throw new Error('expected a track');
    }
    const base = {
      downloads: {},
      versionTotals: { v1: 1 },
      currentRound: 1,
      listenerTallies: { 1: { v1: { A: 0, B: 4 } } },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...base,
            tallies: { 1: { v1: { A: 3, B: -1 } } },
            mine: { 1: [{ versionSlug: 'v1', takeLabel: 'A', value: 1, round: 1 }] },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...base,
            tallies: { 1: { v1: { A: 2, B: -1 } } },
            mine: { 1: [{ versionSlug: 'v1', takeLabel: 'A', value: 0, round: 1 }] },
          }),
        })
    );
    render(
      <AlbumPlayer
        version={{ ...sampleVersion, tracks: [track] }}
        voter='owner'
        votes={{
          ...EMPTY_VOTE_SNAPSHOT,
          tallies: { 1: { v1: { A: 2, B: -1 } } },
          listenerTallies: { 1: { v1: { A: 0, B: 4 } } },
        }}
      />
    );

    expect(screen.getByText('Score take A')).toBeInTheDocument();
    expect(screen.getByText(/Vote here while you listen\. Score \+2/)).toBeInTheDocument();
    expect(screen.queryByText('Listeners 0')).not.toBeInTheDocument();
    expect(screen.getByText('Listeners +4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show score controls/i })).not.toBeInTheDocument();
    const chip = document.querySelector('[data-take-chip]');
    expect(chip).toHaveClass('overflow-hidden', 'rounded-lg');
    const add = screen.getAllByRole('button', { name: /Add one to take A of Track One/i });
    expect(add).toHaveLength(2);
    expect(add[0]).toHaveClass('size-11');
    expect(add[1]).toHaveClass('size-11');
    const chipAdd = add[1];
    if (chipAdd === undefined) {
      throw new Error('expected a chip vote button');
    }
    await user.click(chipAdd);

    expect(screen.getByText(/Vote here while you listen\. Score \+3/)).toBeInTheDocument();
    expect(screen.getAllByText('+3').length).toBeGreaterThan(1);
    expect(screen.queryByText('Listeners 0')).not.toBeInTheDocument();

    const subtract = screen.getAllByRole('button', {
      name: /Subtract one from take A of Track One/i,
    });
    const panelSubtract = subtract[0];
    if (panelSubtract === undefined) {
      throw new Error('expected the player score control');
    }
    await user.click(panelSubtract);

    expect(screen.getByText(/Vote here while you listen\. Score \+2/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hide score controls/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Add one to take A of Track One/i })).toHaveLength(
      2
    );
  });

  it('lets a listener score on a chip without owner listener totals', () => {
    const track = sampleVersion.tracks[0];
    if (track === undefined) {
      throw new Error('expected a track');
    }
    render(
      <AlbumPlayer
        version={{ ...sampleVersion, tracks: [track] }}
        voter='listener'
        votes={{
          ...EMPTY_VOTE_SNAPSHOT,
          tallies: { 1: { v1: { A: 2 } } },
          listenerTallies: { 1: { v1: { A: 9 } } },
        }}
      />
    );

    expect(screen.queryByText(/Listeners/)).not.toBeInTheDocument();
    expect(screen.getByText('Score take A')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Add one to take A of Track One/i })).toHaveLength(
      2
    );
    expect(screen.queryByRole('button', { name: /Show score controls/i })).not.toBeInTheDocument();
  });

  it('keeps a shuffled take’s prompt, stream and score when letters are revealed', async () => {
    const user = userEvent.setup();
    const trap = 'G minor, 128 BPM, trap drums and a wide EDM lead.';
    const ballad = 'A major, 90 BPM, acoustic ballad.';
    const trapUrl = 'https://cdn1.suno.ai/clip-trap-recording.mp4';
    const siblingUrl = 'https://cdn1.suno.ai/clip-sibling-recording.mp4';
    const hidden: AlbumVersion = {
      ...sampleVersion,
      tracks: [
        {
          number: 1,
          title: 'krillAF',
          kind: 'album',
          filename: 'trap-recording',
          audioUrl: trapUrl,
          prompt: null,
          takes: [
            {
              label: 'H',
              voteLabel: 'H',
              stableId: 'trap-recording',
              filename: 'trap-recording',
              audioUrl: trapUrl,
              versionSlug: 'v1',
            },
            {
              label: 'A',
              voteLabel: 'A',
              stableId: 'sibling-recording',
              filename: 'sibling-recording',
              audioUrl: siblingUrl,
              versionSlug: 'v1',
            },
          ],
        },
      ],
    };
    const shown: AlbumVersion = {
      ...hidden,
      tracks: [
        {
          ...hidden.tracks[0]!,
          filename: 'v1-01-krillaf-p4-takec.mp3',
          takes: [
            {
              label: 'C',
              voteLabel: 'C',
              stableId: 'trap-recording',
              filename: 'v1-01-krillaf-p4-takec.mp3',
              audioUrl: trapUrl,
              versionSlug: 'v1',
              prompt: trap,
              details: {
                style: trap,
                writer: 'Cursor · grok-4.7-high',
                sunoModel: 'v6',
                promptSource: 'generation',
              },
            },
            {
              label: 'H',
              voteLabel: 'H',
              stableId: 'sibling-recording',
              filename: 'v1-01-krillaf-p1-takeh.mp3',
              audioUrl: siblingUrl,
              versionSlug: 'v1',
              prompt: ballad,
              details: {
                style: ballad,
                writer: 'Cursor · other-model',
                sunoModel: 'v6',
                promptSource: 'generation',
              },
            },
          ],
        },
      ],
    };
    const votes = {
      ...EMPTY_VOTE_SNAPSHOT,
      tallies: { 1: { v1: { H: 1, A: 0 } } },
      mine: { 1: [{ versionSlug: 'v1', takeLabel: 'H', value: 1, round: 1 }] },
    };
    const view = render(<AlbumPlayer version={hidden} votes={votes} />);

    await user.click(screen.getByRole('button', { name: 'Take H' }));
    expect(document.querySelector('video')).toHaveAttribute('src', trapUrl);
    expect(screen.getByText('Score take H')).toBeInTheDocument();
    expect(screen.queryByText(trap)).not.toBeInTheDocument();

    view.rerender(<AlbumPlayer version={shown} votes={votes} />);

    expect(screen.getByText('Prompt · Take C')).toBeInTheDocument();
    expect(screen.getByText(trap)).toBeInTheDocument();
    expect(screen.getByText('Cursor · grok-4.7-high · Suno v6')).toBeInTheDocument();
    expect(screen.queryByText(ballad)).not.toBeInTheDocument();
    expect(document.querySelector('video')).toHaveAttribute('src', trapUrl);
    expect(screen.getByText('Score take C')).toBeInTheDocument();
    expect(screen.getByText(/Vote here while you listen\. Score \+1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take H' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Take C' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps each sibling stream when both takes share a style prompt', async () => {
    const user = userEvent.setup();
    const style = 'G minor, 128 BPM, trap drums and a wide EDM lead.';
    const firstUrl = 'https://cdn1.suno.ai/clip-sibling-a.mp4';
    const secondUrl = 'https://cdn1.suno.ai/clip-sibling-b.mp4';
    const version: AlbumVersion = {
      ...sampleVersion,
      tracks: [
        {
          number: 1,
          title: 'krillAF',
          kind: 'album',
          filename: 'v1-01-krillaf-p1-takea.mp3',
          audioUrl: firstUrl,
          prompt: style,
          takes: [
            {
              label: 'A',
              voteLabel: 'A',
              stableId: 'sibling-a',
              filename: 'v1-01-krillaf-p1-takea.mp3',
              audioUrl: firstUrl,
              versionSlug: 'v1',
              prompt: style,
              details: {
                style,
                writer: 'Cursor · grok-4.7-high',
                sunoModel: 'v6',
                promptSource: 'generation',
              },
            },
            {
              label: 'B',
              voteLabel: 'B',
              stableId: 'sibling-b',
              filename: 'v1-01-krillaf-p1-takeb.mp3',
              audioUrl: secondUrl,
              versionSlug: 'v1',
              prompt: style,
              details: {
                style,
                writer: 'Cursor · grok-4.7-high',
                sunoModel: 'v6',
                promptSource: 'generation',
              },
            },
          ],
        },
      ],
    };
    render(<AlbumPlayer version={version} />);

    expect(document.querySelector('video')).toHaveAttribute('src', firstUrl);
    expect(screen.getByText('Prompt · Take A')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Take B' }));
    expect(document.querySelector('video')).toHaveAttribute('src', secondUrl);
    expect(screen.getByText('Prompt · Take B')).toBeInTheDocument();
    expect(screen.getByText('Cursor · grok-4.7-high · Suno v6')).toBeInTheDocument();
  });

  it('sorts owner take chips by score and keeps the selected take', async () => {
    const user = userEvent.setup();
    const labels = ['J', 'C', 'A', 'B'] as const;
    const track = {
      number: 1,
      title: 'Track One',
      kind: 'album' as const,
      filename: 'v1-01-track-one-p1-takej.mp3',
      audioUrl: '/j.mp3',
      takes: labels.map(label => ({
        label,
        filename: `v1-01-track-one-p1-take${label.toLowerCase()}.mp3`,
        audioUrl: `/${label.toLowerCase()}.mp3`,
        versionSlug: 'v1',
        voteLabel: label,
      })),
      prompt: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          downloads: {},
          versionTotals: { v1: 11 },
          currentRound: 1,
          tallies: { 1: { v1: { A: 10, B: 0, C: 0, J: 9 } } },
          mine: { 1: [{ versionSlug: 'v1', takeLabel: 'A', value: 1, round: 1 }] },
        }),
      })
    );
    render(
      <AlbumPlayer
        version={{ ...sampleVersion, tracks: [track] }}
        listenChoices={{ 1: { manual: false, token: null, hasBonus: false } }}
        votes={{
          ...EMPTY_VOTE_SNAPSHOT,
          tallies: { 1: { v1: { A: 1, B: 0, C: 0, J: 9 } } },
        }}
      />
    );

    const row = document.querySelector('[data-track-row]');
    if (!(row instanceof HTMLElement)) {
      throw new Error('expected a track card');
    }
    const card: HTMLElement = row;
    function chipLabels(): string[] {
      return within(card)
        .getAllByRole('button', { name: /^Take [A-Z]$/ })
        .map(button => button.textContent ?? '');
    }

    expect(chipLabels()).toEqual(['Take J', 'Take A', 'Take B', 'Take C']);
    expect(within(card).getByRole('button', { name: 'Take J' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Score take J')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: /Add one to take A of Track One/i }));

    expect(chipLabels()).toEqual(['Take A', 'Take J', 'Take B', 'Take C']);
    expect(within(card).getByRole('button', { name: 'Take J' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Score take J')).toBeInTheDocument();
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
