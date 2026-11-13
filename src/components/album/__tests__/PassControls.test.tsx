import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PassControls } from '@/components/album/PassControls';

afterEach(() => vi.unstubAllGlobals());

describe('PassControls', () => {
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
    render(<PassControls currentRound={2} remaining={5} nextCut={2} unscored={1} />);

    await user.click(screen.getByRole('button', { name: 'Review next pass' }));
    expect(screen.getByText(/3 of 5 current takes/)).toBeInTheDocument();
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
