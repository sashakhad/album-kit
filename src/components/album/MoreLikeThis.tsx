'use client';

import { useRef, useState, type FormEvent } from 'react';

type Props = {
  filename: string;
  trackNumber: number;
  trackTitle: string;
  blindRound?: number;
};

type Attempt = {
  id: string;
  trackNumber: number;
  parentTakeFilename?: string;
  parentTakeToken?: string;
  sourceRound?: number;
  requestedTakes: number;
  instructions: string;
};

function sameParent(attempt: Attempt, filename: string, blindRound?: number) {
  return blindRound === undefined
    ? attempt.parentTakeFilename === filename && attempt.parentTakeToken === undefined
    : attempt.parentTakeToken === filename &&
        attempt.sourceRound === blindRound &&
        attempt.parentTakeFilename === undefined;
}

function attemptKey(trackNumber: number, filename: string) {
  return `album-variation-request:${trackNumber}:${filename}`;
}

function savedAttempt(trackNumber: number, filename: string, blindRound?: number): Attempt | null {
  try {
    const raw = sessionStorage.getItem(attemptKey(trackNumber, filename));
    if (raw === null) return null;
    const value: Attempt = JSON.parse(raw);
    return value.trackNumber === trackNumber &&
      sameParent(value, filename, blindRound) &&
      typeof value.id === 'string' &&
      typeof value.requestedTakes === 'number' &&
      typeof value.instructions === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}

function storeAttempt(attempt: Attempt) {
  const filename = attempt.parentTakeFilename ?? attempt.parentTakeToken;
  if (filename === undefined) return;
  try {
    sessionStorage.setItem(attemptKey(attempt.trackNumber, filename), JSON.stringify(attempt));
  } catch {
    /* Session storage can be unavailable. */
  }
}

function clearStoredAttempt(attempt: Attempt) {
  const filename = attempt.parentTakeFilename ?? attempt.parentTakeToken;
  if (filename === undefined) return;
  try {
    sessionStorage.removeItem(attemptKey(attempt.trackNumber, filename));
  } catch {
    /* Session storage can be unavailable. */
  }
}

function pendingBlindAttempts(trackNumber: number): Attempt[] {
  try {
    const prefix = `album-variation-request:${trackNumber}:`;
    return Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
      .filter((key): key is string => key !== null && key.startsWith(prefix))
      .flatMap(key => {
        try {
          const value: Attempt = JSON.parse(sessionStorage.getItem(key) ?? 'null');
          return value?.trackNumber === trackNumber &&
            typeof value.id === 'string' &&
            typeof value.parentTakeToken === 'string' &&
            typeof value.sourceRound === 'number' &&
            typeof value.requestedTakes === 'number' &&
            typeof value.instructions === 'string'
            ? [value]
            : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

async function recoverBlindAttempt(trackNumber: number, filename: string) {
  for (const candidate of pendingBlindAttempts(trackNumber)) {
    try {
      // Without sourceRound, a revealed pass returns the canonical parent for comparison.
      const response = await fetch(`/api/owner/variations?id=${encodeURIComponent(candidate.id)}`);
      if (!response.ok) return { kind: 'unconfirmed' as const, candidate };
      const found: Attempt & { status?: string } = await response.json();
      if (
        found.id !== candidate.id ||
        found.trackNumber !== candidate.trackNumber ||
        found.requestedTakes !== candidate.requestedTakes ||
        found.instructions !== candidate.instructions ||
        typeof found.parentTakeFilename !== 'string'
      )
        return { kind: 'unconfirmed' as const, candidate };
      clearStoredAttempt(candidate);
      if (found.status !== 'canceled' && found.parentTakeFilename === filename)
        return { kind: 'saved' as const };
    } catch {
      return { kind: 'unconfirmed' as const, candidate };
    }
  }
  return { kind: 'none' as const };
}

export function MoreLikeThis({ filename, trackNumber, trackTitle, blindRound }: Props) {
  const savedMessage =
    blindRound === undefined
      ? 'Request saved. The bot will prepare a cost estimate before generation.'
      : 'Request saved blind. Reveal this pass before the bot prepares its prompt and cost estimate.';
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(2);
  const [instructions, setInstructions] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const pendingRef = useRef(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resolvingEarlierBlindAttempt, setResolvingEarlierBlindAttempt] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    const previous = savedAttempt(trackNumber, filename, blindRound) ?? attempt.current;
    const normalized = instructions.trim();
    if (
      previous !== null &&
      (previous.trackNumber !== trackNumber ||
        !sameParent(previous, filename, blindRound) ||
        previous.requestedTakes !== count ||
        previous.instructions !== normalized)
    ) {
      setUnconfirmed(true);
      setMessage('Check the earlier request before changing it.');
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setMessage(null);
    try {
      if (previous === null && blindRound === undefined) {
        const recovered = await recoverBlindAttempt(trackNumber, filename);
        if (recovered.kind === 'saved') {
          setUnconfirmed(false);
          setResolvingEarlierBlindAttempt(false);
          setMessage(
            'An earlier blind request is already saved for this take. No new request was sent.'
          );
          setOpen(false);
          return;
        }
        if (recovered.kind === 'unconfirmed') {
          attempt.current = recovered.candidate;
          setUnconfirmed(true);
          setResolvingEarlierBlindAttempt(true);
          setMessage(
            'An earlier blind request on this track is unconfirmed. Check its status or cancel its ID before requesting another take.'
          );
          return;
        }
      }
      const current: Attempt = previous ?? {
        id: crypto.randomUUID(),
        trackNumber,
        ...(blindRound === undefined
          ? { parentTakeFilename: filename }
          : { parentTakeToken: filename, sourceRound: blindRound }),
        requestedTakes: count,
        instructions: normalized,
      };
      attempt.current = current;
      storeAttempt(current);
      const response = await fetch('/api/owner/variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current),
      });
      const body: { error?: string; next?: string } = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not save this request');
      clearStoredAttempt(current);
      attempt.current = null;
      setUnconfirmed(false);
      setResolvingEarlierBlindAttempt(false);
      setMessage(body.next ?? savedMessage);
      setOpen(false);
    } catch {
      setUnconfirmed(true);
      setMessage(
        'Could not confirm whether this request was saved. Retry the same request or check its status.'
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function checkStatus() {
    const current = savedAttempt(trackNumber, filename, blindRound) ?? attempt.current;
    if (current === null || pendingRef.current) return;
    const priorBlind = blindRound === undefined && current.parentTakeToken !== undefined;
    pendingRef.current = true;
    setPending(true);
    try {
      const sourceRound =
        current.sourceRound === undefined || priorBlind
          ? ''
          : `&sourceRound=${current.sourceRound}`;
      const response = await fetch(
        `/api/owner/variations?id=${encodeURIComponent(current.id)}${sourceRound}`
      );
      if (response.status === 404) {
        setMessage(
          'No request is saved yet. Retry the same request, or cancel its ID before editing.'
        );
        return;
      }
      if (!response.ok) throw new Error('Status unavailable');
      const found: Attempt & { status?: string } = await response.json();
      if (
        found.id !== current.id ||
        found.trackNumber !== current.trackNumber ||
        (priorBlind
          ? typeof found.parentTakeFilename !== 'string'
          : found.parentTakeFilename !== current.parentTakeFilename ||
            found.parentTakeToken !== current.parentTakeToken ||
            found.sourceRound !== current.sourceRound) ||
        found.requestedTakes !== current.requestedTakes ||
        found.instructions !== current.instructions
      )
        throw new Error('Request details differ');
      if (found.status === 'canceled') {
        clearStoredAttempt(current);
        attempt.current = null;
        setUnconfirmed(false);
        setResolvingEarlierBlindAttempt(false);
        setMessage('Request canceled. You can edit and try again.');
        return;
      }
      clearStoredAttempt(current);
      attempt.current = null;
      setUnconfirmed(false);
      setResolvingEarlierBlindAttempt(false);
      if (priorBlind && found.parentTakeFilename !== filename) {
        setMessage('Earlier blind request saved for another take. You can request this one.');
        return;
      }
      setOpen(false);
      setMessage(savedMessage);
    } catch {
      setMessage('Status is still unavailable. Keep this request and check again before editing.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function cancelAttempt() {
    const current = savedAttempt(trackNumber, filename, blindRound) ?? attempt.current;
    if (current === null || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      const response = await fetch('/api/owner/variations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current),
      });
      if (!response.ok) throw new Error('Could not cancel request');
      clearStoredAttempt(current);
      attempt.current = null;
      setUnconfirmed(false);
      setResolvingEarlierBlindAttempt(false);
      setMessage('Previous request canceled. You can edit and try again.');
    } catch {
      setMessage('Could not cancel this request. Check its status or retry the same request.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className='text-sm'>
      <button
        type='button'
        disabled={pending}
        onClick={() => {
          if (pendingRef.current) return;
          if (!open) {
            const previous = savedAttempt(trackNumber, filename, blindRound) ?? attempt.current;
            if (previous !== null) {
              attempt.current = previous;
              setCount(previous.requestedTakes);
              setInstructions(previous.instructions);
              setUnconfirmed(true);
              setMessage(
                'An earlier save is unconfirmed. Retry it or check its status before editing.'
              );
            } else {
              setMessage(null);
            }
          }
          setOpen(value => !value);
        }}
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
              onChange={event => setCount(Number(event.target.value))}
              className='bg-background block w-24 rounded-md border border-white/20 px-2 py-2'
              disabled={pending || unconfirmed}
              required
            />
          </label>
          <label className='block space-y-1'>
            <span>What should change? (optional)</span>
            <textarea
              value={instructions}
              onChange={event => setInstructions(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder='More bass, slower, keep the hook'
              className='bg-background block w-full rounded-md border border-white/20 px-2 py-2'
              disabled={pending || unconfirmed}
            />
          </label>
          <p className='text-muted-foreground text-xs'>
            Saves a request for this track only. Suno may produce takes in batches; the bot will
            show the exact output and cost estimate for approval before using credits.
          </p>
          <div className='flex flex-wrap gap-2'>
            {!resolvingEarlierBlindAttempt ? (
              <button
                type='submit'
                disabled={pending || count < 1 || count > 20}
                className='bg-foreground text-background min-h-11 rounded-lg px-4 font-medium disabled:opacity-50'
              >
                {pending ? 'Checking…' : unconfirmed ? 'Retry same request' : 'Request variations'}
              </button>
            ) : null}
            {unconfirmed ? (
              <>
                <button
                  type='button'
                  disabled={pending}
                  onClick={() => void checkStatus()}
                  className='min-h-11 rounded-lg px-3 underline disabled:opacity-50'
                >
                  Check status
                </button>
                <button
                  type='button'
                  disabled={pending}
                  onClick={() => void cancelAttempt()}
                  className='min-h-11 rounded-lg px-3 underline disabled:opacity-50'
                >
                  Cancel request and edit
                </button>
              </>
            ) : null}
            <button
              type='button'
              disabled={pending}
              onClick={() => setOpen(false)}
              className='min-h-11 rounded-lg px-3 underline disabled:opacity-50'
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {message ? (
        <p className='text-muted-foreground mt-2' role='status'>
          {message}
        </p>
      ) : null}
    </div>
  );
}
