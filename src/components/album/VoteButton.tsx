'use client';

import { useState, type MouseEvent } from 'react';
import { Minus, Plus } from 'lucide-react';

import { countForTake, choiceForTake } from '@/lib/votes/tally';
import type { VoteDelta, VoteSnapshot } from '@/lib/votes/types';
import { formatSignedScore } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export function VoteButton({
  trackNumber,
  versionSlug,
  takeLabel,
  trackTitle,
  initialCount,
  initialValue,
  onSnapshot,
}: {
  trackNumber: number;
  versionSlug: string;
  takeLabel: string;
  trackTitle: string;
  initialCount: number;
  initialValue: number;
  onSnapshot?: (snapshot: VoteSnapshot) => void;
}) {
  const [count, setCount] = useState(initialCount);
  const [myScore, setMyScore] = useState(initialValue);
  const [pending, setPending] = useState(false);

  async function cast(event: MouseEvent<HTMLButtonElement>, value: VoteDelta) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) {
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackNumber, versionSlug, takeLabel, value }),
      });
      if (!response.ok) {
        return;
      }
      const snapshot: unknown = await response.json();
      if (!isVoteSnapshot(snapshot)) {
        return;
      }
      setCount(countForTake(snapshot, trackNumber, versionSlug, takeLabel));
      setMyScore(choiceForTake(snapshot, trackNumber, versionSlug, takeLabel));
      onSnapshot?.(snapshot);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className='flex shrink-0 flex-col items-center gap-1'>
      <span className='text-muted-foreground text-[10px] tracking-wide uppercase'>Score</span>
      <div className='flex items-center rounded-lg border border-white/15 bg-black/15 p-0.5'>
        <button
          type='button'
          onClick={event => void cast(event, -1)}
          disabled={pending}
          aria-label={`Subtract one from take ${takeLabel} of ${trackTitle}`}
          className={cn(
            'flex size-9 items-center justify-center rounded-md',
            myScore < 0
              ? 'text-destructive bg-destructive/12'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/8'
          )}
        >
          <Minus className='size-4' />
        </button>
        <span aria-live='polite' className='min-w-8 text-center font-mono text-sm'>
          {formatSignedScore(count)}
        </span>
        <button
          type='button'
          onClick={event => void cast(event, 1)}
          disabled={pending}
          aria-label={`Add one to take ${takeLabel} of ${trackTitle}`}
          className={cn(
            'flex size-9 items-center justify-center rounded-md',
            myScore > 0
              ? 'text-primary bg-primary/12'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/8'
          )}
        >
          <Plus className='size-4' />
        </button>
      </div>
    </div>
  );
}

function isVoteSnapshot(value: unknown): value is VoteSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return 'tallies' in value && 'mine' in value && 'versionTotals' in value;
}
