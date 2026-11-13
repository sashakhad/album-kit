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

  it('keeps saved model choices while exposing an editable Cursor request', async () => {
    render(
      <SettingsForm
        albumTitle='Album'
        initial={{ ...DEFAULT_SETTINGS, sunoModel: 'v6-mini', promptWriter: 'cursor' }}
        privateStorage
        lastSunoCheck={{ models: ['v6', 'v6-mini'], resolvedModel: 'v6-mini' }}
      />
    );
    expect(screen.getByLabelText('Suno model')).toHaveValue('v6-mini');
    fireEvent.click(screen.getByText('Advanced music settings'));
    expect(await screen.findByLabelText('Requested Cursor model')).toHaveValue('auto');
    fireEvent.change(screen.getByLabelText('Requested Cursor model'), {
      target: { value: 'owner requested model' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Requested Cursor model')).toHaveValue('auto');
  });

  it('allows a Suno model request before the first account capability check', () => {
    render(
      <SettingsForm
        albumTitle='Album'
        initial={DEFAULT_SETTINGS}
        privateStorage
        lastSunoCheck={null}
      />
    );
    fireEvent.change(screen.getByLabelText('Suno model'), { target: { value: '__custom__' } });
    fireEvent.change(screen.getByLabelText('Requested Suno model ID'), {
      target: { value: 'owner-model-id' },
    });
    expect(screen.getByLabelText('Requested Suno model ID')).toHaveValue('owner-model-id');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Suno model')).toHaveValue('auto');
    expect(screen.queryByLabelText('Requested Suno model ID')).not.toBeInTheDocument();
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
