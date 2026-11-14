import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MERGE_BALLOT_DISMISS_KEY, MergeBallotOffer, MergeBallotPrompt } from '../MergeBallotOffer';

const refresh = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

beforeEach(() => {
  refresh.mockReset();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('MergeBallotOffer', () => {
  it('names the listener votes and merges them into owner scores', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const fetchMock = vi.fn(async () => Response.json({ merged: 1234 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MergeBallotOffer votes={1234} onDone={onDone} onSkip={vi.fn()} />);

    expect(screen.getByRole('region', { name: 'Merge listener votes' })).toHaveTextContent(
      '1,234 listener votes'
    );

    await user.click(screen.getByRole('button', { name: 'Merge into my scores' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/owner/merge-ballot', { method: 'POST' });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('keeps the ballots separate when the owner declines', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(<MergeBallotOffer votes={1} onDone={vi.fn()} onSkip={onSkip} />);

    expect(screen.getByText(/1 listener vote\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep them separate' }));

    expect(onSkip).toHaveBeenCalledOnce();
  });
});

describe('MergeBallotPrompt', () => {
  it('offers the merge again from a one-line control after it was dismissed', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(MERGE_BALLOT_DISMISS_KEY, '1');
    render(<MergeBallotPrompt votes={2} />);

    const reopen = await screen.findByRole('button', { name: 'Merge 2 listener votes' });
    await user.click(reopen);

    expect(screen.getByRole('button', { name: 'Merge into my scores' })).toBeInTheDocument();
  });

  it('refreshes owner scores after a merge', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ merged: 2 }))
    );
    render(<MergeBallotPrompt votes={2} />);

    await user.click(await screen.findByRole('button', { name: 'Merge into my scores' }));

    expect(refresh).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem(MERGE_BALLOT_DISMISS_KEY)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Merge listener votes' })).not.toBeInTheDocument();
  });
});
