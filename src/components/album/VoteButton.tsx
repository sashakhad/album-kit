'use client';

import { useState, type MouseEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
    <div className='flex shrink-0 flex-col items-center'>
      <button
        type='button'
        onClick={event => void cast(event, 1)}
        disabled={pending}
        aria-label={`Upvote take ${takeLabel} of ${trackTitle}`}
        className={cn(
          'flex size-10 items-center justify-center rounded-md',
          myScore > 0
            ? 'text-primary bg-primary/12'
            : 'text-muted-foreground hover:text-foreground hover:bg-white/6'
        )}
      >
        <ChevronUp className='size-5' />
      </button>
      <span aria-live='polite' className='text-muted-foreground font-mono text-xs'>
        {formatSignedScore(count)}
      </span>
      <button
        type='button'
        onClick={event => void cast(event, -1)}
        disabled={pending}
        aria-label={`Downvote take ${takeLabel} of ${trackTitle}`}
        className={cn(
          'flex size-10 items-center justify-center rounded-md',
          myScore < 0
            ? 'text-destructive bg-destructive/12'
            : 'text-muted-foreground hover:text-foreground hover:bg-white/6'
        )}
      >
        <ChevronDown className='size-5' />
      </button>
    </div>
  );
}

function isVoteSnapshot(value: unknown): value is VoteSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return 'tallies' in value && 'mine' in value && 'versionTotals' in value;
}
