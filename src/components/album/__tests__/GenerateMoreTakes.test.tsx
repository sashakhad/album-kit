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
  it('offers in-form confirmation after allowance changes and keeps uncertain dispatch polling', async () => {
    const quote = {
      quoteKey: 'a'.repeat(64),
      model: 'v6',
      generations: 1,
      expectedOutputs: 2,
      generationCredits: 10,
      downloadCredits: 0,
      remainingAllowance: 20,
      requiresConfirmation: false,
      blockers: [],
      externalSpendEstimateUsd: 0,
      hostingChargeEstimateUsd: 0,
    };
    let dispatches = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/generate')) {
        dispatches += 1;
        return dispatches === 1
          ? {
              ok: false,
              status: 409,
              json: async () => ({
                error: 'Confirm the additional cost in the form.',
                quote: { ...quote, remainingAllowance: 0, requiresConfirmation: true },
              }),
            }
          : {
              ok: true,
              status: 202,
              json: async () => ({ status: 'generating', dispatchUncertain: true }),
            };
      }
      return { ok: true, status: 200, json: async () => (url.endsWith('/quote') ? { quote } : []) };
    });
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
    await screen.findByText(/2 requested · 2 expected/);
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await screen.findByText('Confirm the additional cost in the form.');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(dispatches).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Confirm and generate' }));
    expect(
      await screen.findByText(
        'Generation receipt is uncertain. Checking this request; no duplicate will be sent.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More like this' })).toBeDisabled();
    expect(dispatches).toBe(2);
  });
});
