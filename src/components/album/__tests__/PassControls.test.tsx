import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PassControls } from '@/components/album/PassControls';

afterEach(() => vi.unstubAllGlobals());

describe('PassControls', () => {
  it('waits to say that pass 1 cuts nothing until the pass is reviewed', async () => {
    const user = userEvent.setup();
    render(<PassControls currentRound={1} remaining={6} nextCut={0} />);

    expect(
      screen.queryByText(/No takes will be cut|Only negative|unscored/)
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review next pass' }));
    expect(screen.getByText('Start Pass 2? No takes will be cut.')).toBeInTheDocument();
  });

  it('reviews the next pass, supports cancel, and sends only one pending transition', async () => {
    const user = userEvent.setup();
    let finish: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<PassControls currentRound={2} remaining={5} nextCut={2} />);

    await user.click(screen.getByRole('button', { name: 'Review next pass' }));
    expect(
      screen.getByText('Start Pass 3? 2 takes will be cut. 3 takes will stay.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Confirm pass 3' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Review next pass' }));
    const confirm = screen.getByRole('button', { name: 'Confirm pass 3' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pass',
      expect.objectContaining({ body: JSON.stringify({ action: 'next', expectedRound: 2 }) })
    );
    finish?.({ ok: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review next pass' })).toBeInTheDocument()
    );
  });
});
