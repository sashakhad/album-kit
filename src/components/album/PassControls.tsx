'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { voteHref } from '@/lib/album/play-path';

export function PassControls({ currentRound }: { currentRound: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function startNextRound() {
    if (pending) {
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'next' }),
      });
      if (!response.ok) {
        return;
      }
      router.push(voteHref());
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className='space-y-2'>
      <p className='text-primary/80 text-xs tracking-[0.2em] uppercase'>Round {currentRound}</p>
      <p className='text-muted-foreground text-xs leading-relaxed'>
        {currentRound <= 1
          ? 'Downvoted takes drop off the next round. Parked takes sit under Possible renames. Zero and upvoted takes stay.'
          : 'Earlier downvotes are out. Upvotes carry. Parked takes sit under Possible renames. Zero and unvoted takes stay.'}
      </p>
      <button
        type='button'
        onClick={() => void startNextRound()}
        disabled={pending}
        className='text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline disabled:opacity-40'
      >
        Next round
      </button>
    </div>
  );
}
