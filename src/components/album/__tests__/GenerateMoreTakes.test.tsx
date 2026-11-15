import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GenerateMoreTakes } from '../GenerateMoreTakes';

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('visible More takes form', () => {
  it('shows live cost and confirms above-allowance generation in the form', async () => {
    const quote = {
      quoteKey: 'a'.repeat(64),
      model: 'v6',
      generations: 1,
      expectedOutputs: 2,
      generationCredits: 10,
      downloadCredits: 0,
      remainingAllowance: 0,
      requiresConfirmation: true,
      blockers: [],
      externalSpendEstimateUsd: 0,
      hostingChargeEstimateUsd: 0,
    };
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => ({
      ok: true,
      status: url.endsWith('/generate') ? 202 : 200,
      json: async () =>
        url.endsWith('/quote')
          ? { quote }
          : url.endsWith('/generate')
            ? { status: 'generating' }
            : url.endsWith('/variations')
              ? []
              : {},
    }));
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <GenerateMoreTakes
        filename='v1-01-track-one-p1-takea.mp3'
        trackNumber={1}
        trackTitle='Track One'
      />
    );

    await user.click(screen.getByRole('button', { name: 'More like this' }));
    expect(
      await screen.findByText(/2 requested · 2 expected.*10 Suno credits · v6/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(fetcher.mock.calls.some(([url]) => url === '/api/owner/variations/generate')).toBe(
      false
    );
    await user.click(screen.getByRole('button', { name: 'Confirm and generate' }));
    expect(await screen.findByText('More takes are generating on this track.')).toBeInTheDocument();
    const dispatch = fetcher.mock.calls.find(([url]) => url === '/api/owner/variations/generate');
    expect(JSON.parse(dispatch![1]!.body as string)).toMatchObject({
      quoteKey: quote.quoteKey,
      confirmExtraCost: true,
    });
  });
});
