'use client';

import { useRef, useState, type MouseEvent } from 'react';
import { Minus, Plus } from 'lucide-react';

import { countForTake, choiceForTake } from '@/lib/votes/tally';
import type { VoteDelta, VoteSnapshot } from '@/lib/votes/types';
import { formatSignedScore, formatCompactScore } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export function VoteButton({
  trackNumber,
  versionSlug,
  takeLabel,
  displayLabel = takeLabel,
  trackTitle,
  initialCount,
  initialValue,
  onSnapshot,
}: {
  trackNumber: number;
  versionSlug: string;
  takeLabel: string;
  displayLabel?: string;
  trackTitle: string;
  initialCount: number;
  initialValue: number;
  onSnapshot?: (snapshot: VoteSnapshot) => void;
}) {
  const [count, setCount] = useState(initialCount);
  const [myScore, setMyScore] = useState(initialValue);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState(false);
  const shownCount = onSnapshot === undefined ? count : initialCount;
  const shownMyScore = onSnapshot === undefined ? myScore : initialValue;

  async function cast(event: MouseEvent<HTMLButtonElement>, value: VoteDelta) {
    event.preventDefault();
    event.stopPropagation();
    if (pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setError(false);
    try {
      const response = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackNumber, versionSlug, takeLabel, value }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      const snapshot: unknown = await response.json();
      if (!isVoteSnapshot(snapshot)) {
        return;
      }
      setCount(countForTake(snapshot, trackNumber, versionSlug, takeLabel));
      setMyScore(choiceForTake(snapshot, trackNumber, versionSlug, takeLabel));
      onSnapshot?.(snapshot);
    } catch {
      setError(true);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className='relative flex shrink-0 flex-col items-center gap-1'>
      <span className='text-muted-foreground text-[10px] tracking-wide uppercase'>Score</span>
      <div className='flex items-center rounded-lg border border-white/15 bg-black/15 p-0.5'>
        <button
          type='button'
          onClick={event => void cast(event, -1)}
          disabled={pending}
          aria-label={`Subtract one from take ${displayLabel} of ${trackTitle}`}
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-md',
            shownMyScore < 0
              ? 'text-destructive bg-destructive/12'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/8'
          )}
        >
          <Minus className='size-4' />
        </button>
        <span
          aria-live='polite'
          aria-label={`Score ${formatSignedScore(shownCount)}`}
          title={formatSignedScore(shownCount)}
          className='w-[6ch] shrink-0 text-center font-mono text-sm tabular-nums'
        >
          {formatCompactScore(shownCount)}
        </span>
        <button
          type='button'
          onClick={event => void cast(event, 1)}
          disabled={pending}
          aria-label={`Add one to take ${displayLabel} of ${trackTitle}`}
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-md',
            shownMyScore > 0
              ? 'text-primary bg-primary/12'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/8'
          )}
        >
          <Plus className='size-4' />
        </button>
      </div>
      {error ? (
        <span
          role='alert'
          className='text-destructive absolute top-full right-0 text-xs whitespace-nowrap'
        >
          Score not saved. Try again.
        </span>
      ) : null}
    </div>
  );
}

function isVoteSnapshot(value: unknown): value is VoteSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return 'tallies' in value && 'mine' in value && 'versionTotals' in value;
}
