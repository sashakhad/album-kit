import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MoreLikeThis } from '@/components/album/MoreLikeThis';

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('More like this', () => {
  it('submits an opaque blind take reference without sending its canonical filename', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ next: 'Request saved for preflight' }),
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <MoreLikeThis
        filename={'a'.repeat(32)}
        trackNumber={1}
        trackTitle='Track One'
        blindRound={2}
      />
    );
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    await user.click(screen.getByRole('button', { name: 'Request variations' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Request saved for preflight');
    const sent = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(sent).toMatchObject({ parentTakeToken: 'a'.repeat(32), sourceRound: 2 });
    expect(sent).not.toHaveProperty('parentTakeFilename');
  });

  it('restores a blind request after reload and retries the same token and ID', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ next: 'Saved blind' }) });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    const props = {
      filename: 'a'.repeat(32),
      trackNumber: 1,
      trackTitle: 'Track One',
      blindRound: 2,
    };
    const firstMount = render(<MoreLikeThis {...props} />);
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    await user.click(screen.getByRole('button', { name: 'Request variations' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Could not confirm');
    const first = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    firstMount.unmount();
    render(<MoreLikeThis {...props} />);
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    await user.click(screen.getByRole('button', { name: 'Retry same request' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved blind');
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual(first);
  });

  it('checks an interrupted blind request by ID and source round', async () => {
    let saved: Record<string, unknown> | null = null;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        saved = JSON.parse(init.body as string);
        throw new Error('connection lost');
      }
      return { ok: true, json: async () => ({ ...saved, status: 'requested' }) };
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <MoreLikeThis
        filename={'a'.repeat(32)}
        trackNumber={1}
        trackTitle='Track One'
        blindRound={2}
      />
    );
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    await user.click(screen.getByRole('button', { name: 'Request variations' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Could not confirm');
    await user.click(screen.getByRole('button', { name: 'Check status' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Request saved blind');
    expect(fetcher.mock.calls[1]![0]).toBe(`/api/owner/variations?id=${saved!.id}&sourceRound=2`);
  });
  it('can cancel and return without saving a request', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <MoreLikeThis
        filename='v1-01-track-one-p1-takea.mp3'
        trackNumber={1}
        trackTitle='Track One'
      />
    );
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    expect(screen.getByText('More takes for Track One')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('More takes for Track One')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    expect(screen.getByText('More takes for Track One')).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends one scoped request despite a repeated submit click', async () => {
    let finish!: (value: unknown) => void;
    const fetcher = vi.fn(
      (_url: string, _init: RequestInit) =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <MoreLikeThis
        filename='v1-01-track-one-p1-takea.mp3'
        trackNumber={1}
        trackTitle='Track One'
      />
    );
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    await user.clear(screen.getByRole('spinbutton', { name: 'How many new takes?' }));
    await user.type(screen.getByRole('spinbutton', { name: 'How many new takes?' }), '3');
    await user.type(
      screen.getByRole('textbox', { name: 'What should change? (optional)' }),
      'More bass'
    );
    const submit = screen.getByRole('button', { name: 'Request variations' });
    await user.click(submit);
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({
      trackNumber: 1,
      parentTakeFilename: 'v1-01-track-one-p1-takea.mp3',
      requestedTakes: 3,
      instructions: 'More bass',
    });
    finish({ ok: true, json: async () => ({ next: 'Request saved for preflight' }) });
    expect(await screen.findByRole('status')).toHaveTextContent('Request saved for preflight');
  });

  it('retries an ambiguous save with the same ID after closing and reopening', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ next: 'Saved' }) });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <MoreLikeThis
        filename='v1-01-track-one-p1-takea.mp3'
        trackNumber={1}
        trackTitle='Track One'
      />
    );
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    await user.type(
      screen.getByRole('textbox', { name: 'What should change? (optional)' }),
      'More bass'
    );
    await user.click(screen.getByRole('button', { name: 'Request variations' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Could not confirm');
    const first = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    expect(screen.getByRole('textbox', { name: 'What should change? (optional)' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry same request' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
    const second = JSON.parse(fetcher.mock.calls[1]![1]!.body as string);
    expect(second).toEqual(first);
  });

  it('restores an interrupted request after the component is remounted', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ next: 'Saved' }) });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    const props = {
      filename: 'v1-01-track-one-p1-takea.mp3',
      trackNumber: 1,
      trackTitle: 'Track One',
    };
    const firstMount = render(<MoreLikeThis {...props} />);
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    await user.clear(screen.getByRole('spinbutton', { name: 'How many new takes?' }));
    await user.type(screen.getByRole('spinbutton', { name: 'How many new takes?' }), '3');
    await user.type(
      screen.getByRole('textbox', { name: 'What should change? (optional)' }),
      'Keep the hook'
    );
    await user.click(screen.getByRole('button', { name: 'Request variations' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Could not confirm');
    const first = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    firstMount.unmount();

    render(<MoreLikeThis {...props} />);
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    expect(screen.getByRole('spinbutton', { name: 'How many new takes?' })).toHaveValue(3);
    expect(screen.getByRole('textbox', { name: 'What should change? (optional)' })).toHaveValue(
      'Keep the hook'
    );
    await user.click(screen.getByRole('button', { name: 'Retry same request' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual(first);
  });

  it('checks an ambiguous request before allowing an edited request', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce({ status: 404, ok: false })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ next: 'Saved' }) });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <MoreLikeThis
        filename='v1-01-track-one-p1-takea.mp3'
        trackNumber={1}
        trackTitle='Track One'
      />
    );
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    await user.click(screen.getByRole('button', { name: 'Request variations' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Could not confirm');
    const first = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    await user.click(screen.getByRole('button', { name: 'Check status' }));
    expect(await screen.findByRole('status')).toHaveTextContent('No request is saved yet');
    expect(fetcher.mock.calls[1]![0]).toContain(first.id);
    const count = screen.getByRole('spinbutton', { name: 'How many new takes?' });
    expect(count).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel request and edit' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Previous request canceled');
    expect(fetcher.mock.calls[2]![1]).toMatchObject({
      method: 'DELETE',
      body: JSON.stringify(first),
    });
    expect(count).toBeEnabled();
    await user.clear(count);
    await user.type(count, '4');
    await user.click(screen.getByRole('button', { name: 'Request variations' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
    const second = JSON.parse(fetcher.mock.calls[3]![1]!.body as string);
    expect(second.id).not.toBe(first.id);
    expect(second.requestedTakes).toBe(4);
  });

  it('restores the original parent request after changing takes', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ next: 'Saved' }) });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    const firstTake = 'v1-01-track-one-p1-takea.mp3';
    const secondTake = 'v1-01-track-one-p1-takeb.mp3';
    const { rerender } = render(
      <MoreLikeThis key={firstTake} filename={firstTake} trackNumber={1} trackTitle='Track One' />
    );
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    await user.click(screen.getByRole('button', { name: 'Request variations' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Could not confirm');
    const first = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    rerender(
      <MoreLikeThis key={secondTake} filename={secondTake} trackNumber={1} trackTitle='Track One' />
    );
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    expect(screen.getByRole('button', { name: 'Request variations' })).toBeInTheDocument();
    rerender(
      <MoreLikeThis key={firstTake} filename={firstTake} trackNumber={1} trackTitle='Track One' />
    );
    await user.click(screen.getByRole('button', { name: 'More like this' }));
    expect(screen.getByRole('button', { name: 'Retry same request' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry same request' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual(first);
  });
});
