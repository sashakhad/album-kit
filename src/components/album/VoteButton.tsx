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
  variant = 'panel',
}: {
  trackNumber: number;
  versionSlug: string;
  takeLabel: string;
  displayLabel?: string;
  trackTitle: string;
  initialCount: number;
  initialValue: number;
  onSnapshot?: (snapshot: VoteSnapshot) => void;
  variant?: 'panel' | 'inline';
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

  function stepButton(value: VoteDelta) {
    const subtract = value < 0;
    const active = subtract ? shownMyScore < 0 : shownMyScore > 0;
    return (
      <button
        type='button'
        onClick={event => void cast(event, value)}
        disabled={pending}
        aria-label={
          subtract
            ? `Subtract one from take ${displayLabel} of ${trackTitle}`
            : `Add one to take ${displayLabel} of ${trackTitle}`
        }
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-md',
          active
            ? subtract
              ? 'text-destructive bg-destructive/12'
              : 'text-primary bg-primary/12'
            : 'text-muted-foreground hover:text-foreground hover:bg-white/8'
        )}
      >
        {subtract ? <Minus className='size-4' /> : <Plus className='size-4' />}
      </button>
    );
  }

  const scoreLabel = formatSignedScore(shownCount);
  const scoreText = formatCompactScore(shownCount);

  if (variant === 'inline') {
    return (
      <div
        className='flex max-w-full flex-wrap items-center border-l border-white/15'
        data-inline-vote
      >
        {stepButton(-1)}
        <span
          aria-live='polite'
          aria-label={`Score ${scoreLabel}`}
          title={scoreLabel}
          className='flex h-11 min-w-11 shrink-0 items-center justify-center px-2 font-mono text-sm tabular-nums'
        >
          {scoreText}
        </span>
        {stepButton(1)}
        {error ? (
          <span role='alert' className='text-destructive basis-full px-2 pb-1 text-xs'>
            Score not saved. Try again.
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className='relative flex shrink-0 flex-col items-center gap-1'>
      <span className='text-muted-foreground text-[10px] tracking-wide uppercase'>Score</span>
      <div className='flex items-center rounded-lg border border-white/15 bg-black/15 p-0.5'>
        {stepButton(-1)}
        <span
          aria-live='polite'
          aria-label={`Score ${scoreLabel}`}
          title={scoreLabel}
          className='w-[6ch] shrink-0 text-center font-mono text-sm tabular-nums'
        >
          {scoreText}
        </span>
        {stepButton(1)}
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
