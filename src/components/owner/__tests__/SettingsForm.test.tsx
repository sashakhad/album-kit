import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsForm } from '../SettingsForm';
import { DEFAULT_SETTINGS } from '@/lib/settings/schema';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

describe('album settings', () => {
  it('shows the public album link with scoring already available', () => {
    render(<SettingsForm albumTitle='Album' initial={DEFAULT_SETTINGS} lastSunoCheck={null} />);
    expect(screen.getByRole('textbox', { name: 'Album link' })).toHaveValue(
      `${window.location.origin}/vote`
    );
    expect(screen.queryByLabelText('Who can vote')).not.toBeInTheDocument();
    expect(screen.getByText(/each browser keeps its own scores/i)).toBeInTheDocument();
  });

  it('keeps edits available for retry when saving fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    render(<SettingsForm albumTitle='Album' initial={DEFAULT_SETTINGS} lastSunoCheck={null} />);
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
    render(<SettingsForm albumTitle='Album' initial={DEFAULT_SETTINGS} lastSunoCheck={null} />);
    fireEvent.change(screen.getByLabelText('Suno model'), { target: { value: '__custom__' } });
    fireEvent.change(screen.getByLabelText('Requested Suno model ID'), {
      target: { value: 'owner-model-id' },
    });
    expect(screen.getByLabelText('Requested Suno model ID')).toHaveValue('owner-model-id');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Suno model')).toHaveValue('auto');
    expect(screen.queryByLabelText('Requested Suno model ID')).not.toBeInTheDocument();
  });

  it('swaps, reduces, recovers an unavailable writer, and previews the take count', async () => {
    render(
      <SettingsForm
        albumTitle='Album'
        initial={{ ...DEFAULT_SETTINGS, promptWriter: 'cursor' }}
        lastSunoCheck={null}
      />
    );
    fireEvent.click(screen.getByText('Advanced music settings'));
    fireEvent.change(await screen.findByLabelText('Comparison'), {
      target: { value: 'originals-plus-combined' },
    });
    fireEvent.change(screen.getByLabelText('Models this project can run'), {
      target: { value: 'Opus, Soul, Grok, Sonnet, Fable, Haiku' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use these writers' }));
    expect(screen.getByText(/6 prompts and 12 takes/)).toBeInTheDocument();
    expect(screen.getByText('Saved lineup: Opus, Soul, Grok, Sonnet, Fable')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Swap'), { target: { value: 'Fable' } });
    fireEvent.change(screen.getByLabelText('With'), { target: { value: 'Haiku' } });
    fireEvent.click(screen.getByRole('button', { name: 'Swap writer' }));
    expect(screen.getByText('Saved lineup: Opus, Soul, Grok, Sonnet, Haiku')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Soul' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Grok' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Haiku' }));
    expect(screen.getByText('Saved lineup: Opus, Sonnet')).toBeInTheDocument();
    expect(screen.getByText(/3 prompts and 6 takes/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Writer lineup'), {
      target: { value: 'Opus, Retired Model' },
    });
    expect(screen.getByText(/Retired Model can't run/)).toBeInTheDocument();
    expect(screen.getByText('Saved lineup: Opus')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Replace Retired Model' }));
    expect(screen.getByText('Saved lineup: Opus, Soul')).toBeInTheDocument();
    expect(screen.queryByText(/Retired Model can't run/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Comparison'), { target: { value: 'curated' } });
    expect(screen.getByText(/Curated suite: 5 prompts and 10 takes/)).toBeInTheDocument();
  });

  it('saves the recommended public review takes until the owner chooses private', async () => {
    const updated = { ...DEFAULT_SETTINGS, reviewTakes: 'private' as const };
    const fetch = vi.fn().mockResolvedValue(Response.json({ resolved: updated }));
    vi.stubGlobal('fetch', fetch);
    render(<SettingsForm albumTitle='Album' initial={DEFAULT_SETTINGS} lastSunoCheck={null} />);
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
