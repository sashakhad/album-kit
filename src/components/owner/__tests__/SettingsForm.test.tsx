import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsForm } from '../SettingsForm';
import { DEFAULT_SETTINGS } from '@/lib/settings/schema';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

describe('album settings', () => {
  it('waits for saved access before showing a listener link and preserves a newer bot edit', async () => {
    const updated = { ...DEFAULT_SETTINGS, visibility: 'public', promptVariations: 2 };
    const fetch = vi.fn().mockResolvedValue(Response.json({ resolved: updated }));
    vi.stubGlobal('fetch', fetch);
    render(
      <SettingsForm
        albumTitle='Album'
        initial={DEFAULT_SETTINGS}
        privateStorage
        lastSunoCheck={null}
      />
    );
    fireEvent.change(screen.getByLabelText('Album access'), { target: { value: 'public' } });
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    expect(screen.queryByRole('textbox', { name: 'Listener link' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Up to date'));
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({ patch: { visibility: 'public' } });
    expect(screen.getByRole('spinbutton', { name: 'Prompts per track' })).toHaveValue(2);
    expect(screen.getByRole('textbox', { name: 'Listener link' })).toHaveValue(
      `${window.location.origin}/listen`
    );
  });

  it('keeps edits available for retry when saving fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    render(
      <SettingsForm
        albumTitle='Album'
        initial={DEFAULT_SETTINGS}
        privateStorage
        lastSunoCheck={null}
      />
    );
    fireEvent.change(screen.getByLabelText('Take details'), { target: { value: 'keep-hidden' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    expect(screen.getByLabelText('Take details')).toHaveValue('keep-hidden');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('saves the recommended public review takes until the owner chooses private', async () => {
    const updated = { ...DEFAULT_SETTINGS, reviewTakes: 'private' as const };
    const fetch = vi.fn().mockResolvedValue(Response.json({ resolved: updated }));
    vi.stubGlobal('fetch', fetch);
    render(
      <SettingsForm
        albumTitle='Album'
        initial={DEFAULT_SETTINGS}
        privateStorage
        lastSunoCheck={null}
      />
    );
    expect(screen.getByLabelText('Review takes on Suno')).toHaveValue('public');
    expect(
      screen.getByText(/Downloading a song from Suno uses Suno download credits/)
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Review takes on Suno'), {
      target: { value: 'private' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Up to date'));
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({
      patch: { reviewTakes: 'private' },
    });
  });
});
