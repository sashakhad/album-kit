import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MERGE_BALLOT_DISMISS_KEY } from '@/components/album/MergeBallotOffer';

import { KeyForm } from '../KeyForm';

const replace = vi.fn();

function installFetch(votes: number) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/api/owner/session') && method === 'POST') {
      return new Response(null, { status: 204 });
    }
    if (url.endsWith('/api/owner/merge-ballot') && method === 'POST') {
      return Response.json({ merged: votes });
    }
    if (url.endsWith('/api/owner/merge-ballot')) {
      return Response.json({ votes });
    }
    return new Response('missing', { status: 500 });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  replace.mockReset();
});

describe('KeyForm', () => {
  it('offers to merge a listener ballot after the owner signs in', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch(2);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { hash: '', pathname: '/key', search: '', replace });
    render(<KeyForm next='/vote' />);

    await user.type(screen.getByLabelText('Album key'), 'album-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('region', { name: 'Merge listener votes' })).toHaveTextContent(
      '2 listener votes'
    );
    expect(replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Merge into my scores' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/owner/merge-ballot', { method: 'POST' });
    expect(replace).toHaveBeenCalledWith('/vote');
  });

  it('remembers a decline and continues to the next page', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', installFetch(4));
    vi.stubGlobal('location', { hash: '', pathname: '/key', search: '', replace });
    render(<KeyForm next='/settings' />);

    await user.type(screen.getByLabelText('Album key'), 'album-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.click(await screen.findByRole('button', { name: 'Keep them separate' }));

    expect(window.sessionStorage.getItem(MERGE_BALLOT_DISMISS_KEY)).toBe('1');
    expect(replace).toHaveBeenCalledWith('/settings');
  });

  it('leaves immediately when this browser has no listener ballot', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', installFetch(0));
    vi.stubGlobal('location', { hash: '', pathname: '/key', search: '', replace });
    render(<KeyForm next='/settings' />);

    await user.type(screen.getByLabelText('Album key'), 'album-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(replace).toHaveBeenCalledWith('/settings');
    expect(screen.queryByRole('region', { name: 'Merge listener votes' })).not.toBeInTheDocument();
  });
});
