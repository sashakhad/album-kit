'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { formatNumberExact } from '@/lib/formatters';

export const MERGE_BALLOT_DISMISS_KEY = 'album-merge-listener-votes';

const dismissListeners = new Set<() => void>();

function emitDismissChange(): void {
  for (const listener of dismissListeners) {
    listener();
  }
}

function subscribeDismissed(listener: () => void): () => void {
  dismissListeners.add(listener);
  return () => {
    dismissListeners.delete(listener);
  };
}

function dismissedSnapshot(): boolean {
  return window.sessionStorage.getItem(MERGE_BALLOT_DISMISS_KEY) === '1';
}

function dismissedServerSnapshot(): boolean {
  return false;
}

export function dismissMergeOffer(): void {
  window.sessionStorage.setItem(MERGE_BALLOT_DISMISS_KEY, '1');
  emitDismissChange();
}

export function clearMergeOfferDismissal(): void {
  window.sessionStorage.removeItem(MERGE_BALLOT_DISMISS_KEY);
  emitDismissChange();
}

function useMergeDismissed(): boolean {
  return useSyncExternalStore(subscribeDismissed, dismissedSnapshot, dismissedServerSnapshot);
}

export function MergeBallotOffer({
  votes,
  onDone,
  onSkip,
}: {
  votes: number;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = `${formatNumberExact(votes)} listener ${votes === 1 ? 'vote' : 'votes'}`;

  async function merge() {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/owner/merge-ballot', { method: 'POST' });
      if (!response.ok) {
        setError('Couldn’t merge those votes. Try again.');
        return;
      }
      onDone();
    } catch {
      setError('Couldn’t reach the album. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role='region'
      aria-label='Merge listener votes'
      className='mb-6 space-y-3 rounded-2xl border border-white/12 bg-white/4 p-4 sm:p-5'
    >
      <p className='text-sm leading-relaxed'>
        This browser has {label}. Merge them into your owner scores?
      </p>
      <div className='flex flex-wrap gap-2'>
        <Button type='button' className='min-h-11' disabled={pending} onClick={() => void merge()}>
          {pending ? 'Merging…' : 'Merge into my scores'}
        </Button>
        <Button
          type='button'
          variant='ghost'
          className='min-h-11'
          disabled={pending}
          onClick={onSkip}
        >
          Keep them separate
        </Button>
      </div>
      {error === null ? null : (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
    </div>
  );
}

export function MergeBallotPrompt({ votes }: { votes: number }) {
  const router = useRouter();
  const dismissed = useMergeDismissed();
  const [hidden, setHidden] = useState(false);

  if (hidden || votes <= 0) {
    return null;
  }

  if (dismissed) {
    return (
      <p className='mb-6'>
        <button
          type='button'
          className='text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-sm underline underline-offset-4'
          onClick={clearMergeOfferDismissal}
        >
          Merge {formatNumberExact(votes)} listener {votes === 1 ? 'vote' : 'votes'}
        </button>
      </p>
    );
  }

  return (
    <MergeBallotOffer
      votes={votes}
      onDone={() => {
        clearMergeOfferDismissal();
        setHidden(true);
        router.refresh();
      }}
      onSkip={dismissMergeOffer}
    />
  );
}
