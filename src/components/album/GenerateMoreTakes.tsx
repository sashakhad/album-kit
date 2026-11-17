'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { formatCurrency, formatNumber } from '@/lib/formatters';
import type { VariationQuote } from '@/lib/variations/quote';

type Attempt = {
  id: string;
  trackNumber: number;
  parentTakeFilename: string;
  requestedTakes: number;
  instructions: string;
};

function attemptKey(trackNumber: number, filename: string) {
  return `album-generation:${trackNumber}:${filename}`;
}

function storedAttempt(trackNumber: number, filename: string): Attempt | null {
  try {
    const raw = sessionStorage.getItem(attemptKey(trackNumber, filename));
    if (!raw) return null;
    const attempt: Attempt = JSON.parse(raw);
    return attempt.trackNumber === trackNumber &&
      attempt.parentTakeFilename === filename &&
      typeof attempt.id === 'string' &&
      typeof attempt.requestedTakes === 'number' &&
      typeof attempt.instructions === 'string'
      ? attempt
      : null;
  } catch {
    return null;
  }
}

export function GenerateMoreTakes({
  filename,
  trackNumber,
  trackTitle,
  trackStatus,
}: {
  filename: string;
  trackNumber: number;
  trackTitle: string;
  trackStatus?: 'generating' | 'ready' | 'failed' | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(2);
  const [instructions, setInstructions] = useState('');
  const [quote, setQuote] = useState<VariationQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const [statusId, setStatusId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    if (!open || count < 1 || count > 20) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setChecking(true);
      setQuote(null);
      setQuoteError('');
      const current: Attempt = attempt.current ?? {
        id: crypto.randomUUID(),
        trackNumber,
        parentTakeFilename: filename,
        requestedTakes: count,
        instructions: instructions.trim(),
      };
      try {
        const response = await fetch('/api/owner/variations/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...current,
            requestedTakes: count,
            instructions: instructions.trim(),
          }),
          signal: controller.signal,
        });
        const body: { quote?: VariationQuote; error?: string } = await response.json();
        if (response.status === 401) throw new Error('Open your owner link to generate takes.');
        if (!response.ok || !body.quote) throw new Error(body.error ?? 'Cost check unavailable.');
        setQuote(body.quote);
      } catch (error) {
        if (!controller.signal.aborted)
          setQuoteError(error instanceof Error ? error.message : 'Cost check unavailable.');
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, count, instructions, filename, trackNumber]);

  useEffect(() => {
    if (statusId === null) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/owner/variations?id=${encodeURIComponent(statusId)}`);
        if (!response.ok) return;
        const row: { status?: string; dispatchError?: string | null } = await response.json();
        if (row.status === 'ready') {
          setMessage('More takes are ready on this track.');
          setStatusId(null);
          router.refresh();
        } else if (row.status === 'failed') {
          setMessage(row.dispatchError ?? 'Generation failed.');
          setStatusId(null);
          router.refresh();
        }
      } catch {
        /* Keep the durable status; the next check can recover. */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [statusId, router]);

  async function openForm() {
    if (open) {
      setOpen(false);
      return;
    }
    const previous = storedAttempt(trackNumber, filename);
    if (previous) {
      attempt.current = previous;
      setCount(previous.requestedTakes);
      setInstructions(previous.instructions);
      setLocked(true);
      setMessage('Checking the earlier generation request before sending another.');
      try {
        const response = await fetch(`/api/owner/variations?id=${encodeURIComponent(previous.id)}`);
        if (response.ok) {
          const row: { status?: string; dispatchError?: string | null; creditsReserved?: number } =
            await response.json();
          if (row.status === 'generating' || row.status === 'ready') {
            sessionStorage.removeItem(attemptKey(trackNumber, filename));
            setStatusId(row.status === 'generating' ? previous.id : null);
            setMessage(
              row.status === 'ready'
                ? 'More takes are ready on this track.'
                : row.dispatchError
                  ? 'Generation receipt is uncertain. Checking this request; no duplicate will be sent.'
                  : 'More takes are generating.'
            );
            router.refresh();
            return;
          }
          if (row.status === 'failed') {
            setMessage(
              row.dispatchError ??
                'Generation failed. This operation will not be retried automatically.'
            );
            if (row.creditsReserved === 0) {
              sessionStorage.removeItem(attemptKey(trackNumber, filename));
              attempt.current = null;
              setLocked(false);
              setOpen(true);
            }
            return;
          }
        }
      } catch {
        /* Keep the same ID until its result is known. */
      }
    } else {
      try {
        const response = await fetch('/api/owner/variations');
        if (response.ok) {
          const rows: Array<Attempt & { status?: string }> = await response.json();
          const existing = rows.find(
            row => row.parentTakeFilename === filename && row.status === 'requested'
          );
          if (existing) {
            attempt.current = existing;
            setCount(existing.requestedTakes);
            setInstructions(existing.instructions);
            setLocked(true);
            setMessage('Using the request you saved earlier for this take.');
          }
        }
      } catch {
        /* Quote and submit still verify the selected parent server-side. */
      }
    }
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !quote || checking || quote.blockers.length > 0) return;
    if (quote.requiresConfirmation && !confirm) {
      setConfirm(true);
      return;
    }
    const current: Attempt = attempt.current ?? {
      id: crypto.randomUUID(),
      trackNumber,
      parentTakeFilename: filename,
      requestedTakes: count,
      instructions: instructions.trim(),
    };
    if (current.requestedTakes !== count || current.instructions !== instructions.trim()) {
      setMessage('An earlier request has different details. Check its status before editing.');
      return;
    }
    attempt.current = current;
    sessionStorage.setItem(attemptKey(trackNumber, filename), JSON.stringify(current));
    pending.current = true;
    setSubmitting(true);
    setMessage('');
    try {
      const saved = await fetch('/api/owner/variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current),
      });
      const savedBody: { error?: string } = await saved.json();
      if (!saved.ok) throw new Error(savedBody.error ?? 'Could not save the request.');
      const response = await fetch('/api/owner/variations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: current.id,
          quoteKey: quote.quoteKey,
          confirmExtraCost: confirm,
        }),
      });
      const body: {
        error?: string;
        quote?: VariationQuote;
        status?: string;
        dispatchUncertain?: boolean;
      } = await response.json();
      if (body.quote) {
        setQuote(body.quote);
        setConfirm(false);
      }
      if (response.status === 401) throw new Error('Open your owner link to generate takes.');
      if (!response.ok) throw new Error(body.error ?? 'Generation did not start.');
      sessionStorage.removeItem(attemptKey(trackNumber, filename));
      attempt.current = null;
      setLocked(false);
      setOpen(false);
      setStatusId(body.status === 'ready' ? null : current.id);
      setMessage(
        body.status === 'ready'
          ? 'More takes are ready on this track.'
          : body.dispatchUncertain
            ? 'Generation receipt is uncertain. Checking this request; no duplicate will be sent.'
            : 'More takes are generating on this track.'
      );
      router.refresh();
    } catch (error) {
      setLocked(true);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Generation status is uncertain. Check it before retrying.'
      );
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className='text-sm'>
      <button
        type='button'
        onClick={() => void openForm()}
        disabled={submitting || trackStatus === 'generating' || statusId !== null}
        className='text-foreground min-h-11 rounded-lg border border-white/20 px-3 font-medium hover:bg-white/10 disabled:opacity-50'
        aria-expanded={open}
      >
        More like this
      </button>
      {open ? (
        <form
          onSubmit={submit}
          className='bg-card mt-3 space-y-3 rounded-xl border border-white/15 p-4'
        >
          <p className='font-medium'>More takes for {trackTitle}</p>
          <label className='block space-y-1'>
            <span>How many new takes?</span>
            <input
              type='number'
              min={1}
              max={20}
              value={count}
              required
              disabled={submitting || locked}
              onChange={event => {
                setCount(Number(event.target.value));
                setQuote(null);
                setConfirm(false);
              }}
              className='bg-background block w-24 rounded-md border border-white/20 px-2 py-2'
            />
          </label>
          <label className='block space-y-1'>
            <span>What should change? (optional)</span>
            <textarea
              value={instructions}
              maxLength={1000}
              rows={3}
              disabled={submitting || locked}
              onChange={event => {
                setInstructions(event.target.value);
                setQuote(null);
                setConfirm(false);
              }}
              placeholder='More bass, slower, keep the hook'
              className='bg-background block w-full rounded-md border border-white/20 px-2 py-2'
            />
          </label>
          {checking ? <p role='status'>Checking current model and credit cost…</p> : null}
          {quoteError ? <p role='alert'>{quoteError}</p> : null}
          {quote ? (
            <div className='text-muted-foreground space-y-1 text-xs'>
              <p>
                {formatNumber(count)} requested · {formatNumber(quote.expectedOutputs)} expected
                from {formatNumber(quote.generations)} generation
                {quote.generations === 1 ? '' : 's'} · {formatNumber(quote.generationCredits)} Suno
                credits · {quote.model}
              </p>
              <p>
                {formatNumber(quote.remainingAllowance)} credits left in your saved More takes
                allowance. Public takes stream from the published file.
              </p>
              {quote.externalSpendEstimateUsd > 0 || quote.hostingChargeEstimateUsd > 0 ? (
                <p>
                  Other estimated charges:{' '}
                  {formatCurrency(quote.externalSpendEstimateUsd + quote.hostingChargeEstimateUsd)}.
                </p>
              ) : null}
              {quote.blockers.map(blocker => (
                <p key={blocker} role='alert'>
                  {blocker}
                </p>
              ))}
              {quote.requiresConfirmation && confirm ? (
                <p role='alert'>
                  {quote.generationCredits > quote.remainingAllowance
                    ? 'This exceeds your remaining credit allowance. '
                    : ''}
                  Confirm {formatNumber(quote.generationCredits)} Suno credits
                  {quote.externalSpendEstimateUsd + quote.hostingChargeEstimateUsd > 0
                    ? ` and ${formatCurrency(quote.externalSpendEstimateUsd + quote.hostingChargeEstimateUsd)} estimated other charges`
                    : ''}{' '}
                  to generate these takes.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className='flex flex-wrap gap-2'>
            <button
              type='submit'
              disabled={submitting || checking || !quote || quote.blockers.length > 0}
              className='bg-foreground text-background min-h-11 rounded-lg px-4 font-medium disabled:opacity-50'
            >
              {submitting
                ? 'Starting…'
                : quote?.requiresConfirmation && confirm
                  ? 'Confirm and generate'
                  : 'Generate'}
            </button>
            <button
              type='button'
              disabled={submitting}
              onClick={() => setOpen(false)}
              className='min-h-11 rounded-lg px-3 underline disabled:opacity-50'
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {message ? (
        <p role='status' className='text-muted-foreground mt-2'>
          {message}
        </p>
      ) : null}
    </div>
  );
}
