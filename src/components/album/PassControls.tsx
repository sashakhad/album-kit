'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { voteHref } from '@/lib/album/play-path';

export function PassControls({ currentRound }: { currentRound: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function startNextRound() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'next' }),
      });
      if (!response.ok) {
        setError('Couldn’t start the next round. Check your owner sign-in and try again.');
        return;
      }
      router.push(voteHref());
      router.refresh();
    } catch {
      setError('Couldn’t reach the album. Check the round before trying again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className='space-y-3 pb-2'>
      <p className='text-muted-foreground text-sm leading-relaxed'>
        The next round drops downvoted takes and carries your positive scores forward. Parked takes
        stay under Possible renames.
      </p>
      <Button
        type='button'
        variant='outline'
        className='min-h-11'
        onClick={() => void startNextRound()}
        disabled={pending}
      >
        {pending ? 'Starting…' : `Start round ${currentRound + 1}`}
      </Button>
      {error.length === 0 ? null : (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
    </div>
  );
}
