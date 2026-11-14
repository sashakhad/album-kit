import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatDateRange } from '@/lib/date';

const state = vi.hoisted(() => ({ owner: true, blind: false, mask: false }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
}));
vi.mock('@/lib/owner/auth', () => ({
  OWNER_VISITOR_ID: 'owner',
  isOwner: async () => state.owner,
}));

const a = { filename: 'v1-01-one-p1-takea.mp3', versionSlug: 'v1', voteLabel: 'A' };
const b = { filename: 'v1-01-one-p1-takeb.mp3', versionSlug: 'v1', voteLabel: 'B' };
const c = { filename: 'v1-01-one-p1-takec.mp3', versionSlug: 'v1', voteLabel: 'C' };
const d = { filename: 'v1-02-two-p1-takea.mp3', versionSlug: 'v1', voteLabel: 'A' };
const e = { filename: 'v1-02-two-p1-takeb.mp3', versionSlug: 'v1', voteLabel: 'B' };
const original = {
  tracks: [
    { number: 1, title: 'One', takes: [a, b, c] },
    { number: 2, title: 'Two', takes: [d, e] },
  ],
};
const current = {
  tracks: [
    { number: 1, title: 'One', takes: [a], parkedTakes: [b] },
    { number: 2, title: 'Two', takes: [d, e] },
  ],
};
const votes: {
  currentRound: number;
  tallies: Record<number, Record<string, Record<string, number>>>;
  listenerTallies?: Record<number, Record<string, Record<string, number>>>;
} = {
  currentRound: 2,
  tallies: { 1: { v1: { A: 2 } }, 2: { v1: { A: 1, B: -1 } } },
  listenerTallies: { 1: { v1: { A: 5 } }, 2: { v1: { B: -2 } } },
};

vi.mock('@/lib/votes/owner-view', () => ({
  ownerJudgingView: async () => ({
    blind: state.blind,
    settings: { maskPromptModels: state.mask },
    votes,
  }),
}));
vi.mock('@/lib/votes/pass-store', () => ({
  getConsolidatedPass: async () => ({ versions: [original], version: current }),
}));
vi.mock('@/lib/album/listen-store', () => ({
  getListenConfig: async () => ({ tracks: [{ number: 1 }, { number: 2 }] }),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    takeProvenance: {
      findMany: async () => [
        {
          filename: a.filename,
          writerHost: 'cursor',
          writerProvider: 'OpenAI',
          observedModel: 'gpt-5',
          attribution: 'verified',
          createdAt: new Date('2026-03-01T12:00:00.000Z'),
        },
        {
          filename: b.filename,
          writerHost: 'grok-bot',
          writerProvider: null,
          observedModel: null,
          attribution: 'undisclosed',
          createdAt: new Date('2026-03-18T12:00:00.000Z'),
        },
        {
          filename: c.filename,
          writerHost: 'cursor',
          writerProvider: 'OpenAI',
          observedModel: null,
          attribution: 'unverified',
        },
      ],
    },
  },
}));

import StatsPage from '../page';

afterEach(() => {
  state.owner = true;
  state.blind = false;
  state.mask = false;
  votes.listenerTallies = { 1: { v1: { A: 5 } }, 2: { v1: { B: -2 } } };
});

describe('owner model stats page', () => {
  it('keeps nonowners outside stats', async () => {
    state.owner = false;
    await expect(StatsPage()).rejects.toThrow('redirect:/key?next=%2Fstats');
  });

  it('renders saved provenance, active scores, cuts, picks and track breakdown', async () => {
    render(await StatsPage());
    expect(
      screen.getByText(
        `Pass 2 · ${formatDateRange('2026-03-01T12:00:00.000Z', '2026-03-18T12:00:00.000Z')}`
      )
    ).toBeInTheDocument();
    const totals = screen.getByRole('region', { name: 'Album totals' });
    expect(within(totals).getByText('Takes').closest('div')).toHaveTextContent('5');
    expect(within(totals).getByText('Liked').closest('div')).toHaveTextContent('2');
    expect(within(totals).getByText('Avg score').closest('div')).toHaveTextContent('+0.7');
    expect(within(totals).getByText('Cut rate').closest('div')).toHaveTextContent('20%');
    expect(within(totals).getByText('Picks').closest('div')).toHaveTextContent('2');
    expect(within(totals).getByText('Models').closest('div')).toHaveTextContent('4');

    const liked = screen
      .getByRole('heading', { name: 'Likes and average score' })
      .closest('section');
    const cuts = screen.getByRole('heading', { name: 'Cut rate' }).closest('section');
    const picks = screen.getByRole('heading', { name: 'Picks' }).closest('section');
    const tracks = screen.getByRole('heading', { name: 'By track' }).closest('section');
    expect(liked).not.toBeNull();
    expect(cuts).not.toBeNull();
    expect(picks).not.toBeNull();
    expect(tracks).not.toBeNull();
    expect(within(liked!).getByText('OpenAI · gpt-5: 1 like, average +2')).toBeInTheDocument();
    expect(within(liked!).getByText('Unverified / missing: 1 like, average 0')).toBeInTheDocument();
    expect(
      within(liked!).getByText('Grok Bot · undisclosed: 0 likes, no active takes')
    ).toBeInTheDocument();
    expect(within(cuts!).getByText('OpenAI · unverified: 100%')).toBeInTheDocument();
    expect(within(picks!).getByText('OpenAI · gpt-5: 1')).toBeInTheDocument();
    expect(within(picks!).getByText('Unverified / missing: 1')).toBeInTheDocument();
    expect(
      within(tracks!).getByRole('cell', { name: '01 One, OpenAI · gpt-5, +2, 1 picks' })
    ).toBeInTheDocument();
    expect(
      within(tracks!).getByRole('cell', { name: '02 Two, Unverified / missing, 0, 1 picks' })
    ).toBeInTheDocument();
    expect(
      within(tracks!).getByRole('cell', {
        name: '01 One, Grok Bot · undisclosed, no active score, 0 picks',
      })
    ).toBeInTheDocument();
    const listenerVotes = screen
      .getByRole('heading', { name: 'Listener votes' })
      .closest('section');
    expect(listenerVotes).not.toBeNull();
    expect(within(listenerVotes!).getByText('+5')).toBeInTheDocument();
    expect(within(listenerVotes!).getByText('-2')).toBeInTheDocument();
    expect(
      within(listenerVotes!).getByText(
        'Listener ballots stay listed here whether or not listeners can vote.'
      )
    ).toBeInTheDocument();
  });

  it.each(['blind', 'mask'] as const)('hides model assignments when %s is enabled', async mode => {
    state[mode] = true;
    render(await StatsPage());
    expect(screen.getByText('Model assignments are hidden')).toBeInTheDocument();
    expect(screen.queryByText('OpenAI · gpt-5')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Every take' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Listener votes' })).toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
  });

  it('shows an empty listener list when nobody has voted as a listener', async () => {
    delete votes.listenerTallies;
    render(await StatsPage());
    expect(screen.getByText('No listener votes yet.')).toBeInTheDocument();
    votes.listenerTallies = { 1: { v1: { A: 5 } }, 2: { v1: { B: -2 } } };
  });
});
