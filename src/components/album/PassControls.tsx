'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { voteHref } from '@/lib/album/play-path';

export function PassControls({
  currentRound,
  remaining,
  nextCut,
  unscored,
}: {
  currentRound: number;
  remaining: number;
  nextCut: number;
  unscored: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');

  async function startNextRound() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'next', expectedRound: currentRound }),
      });
      if (!response.ok) {
        setError(
          response.status === 409
            ? 'The pass already changed. Reload to see the current pass.'
            : 'Couldn’t start the next pass. Check your owner sign-in and try again.'
        );
        return;
      }
      setReviewing(false);
      router.push(voteHref());
      router.refresh();
    } catch {
      setError('Couldn’t reach the album. Check the round before trying again.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className='space-y-3 pb-2'>
      <p className='text-muted-foreground text-sm leading-relaxed'>
        {nextCut} {nextCut === 1 ? 'take has' : 'takes have'} a negative score and will be cut when
        pass {currentRound + 1} starts. Positive scores carry forward; unscored and zero-score takes
        stay. Parked takes stay under Possible renames.
      </p>
      {reviewing ? (
        <div className='space-y-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3'>
          <p className='text-sm'>
            Start pass {currentRound + 1} with {remaining - nextCut} of {remaining} current takes?{' '}
            {unscored > 0 ? `${unscored} have no score yet.` : 'Every current take has a score.'}
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              className='min-h-11'
              onClick={() => void startNextRound()}
              disabled={pending}
            >
              {pending ? 'Starting…' : `Confirm pass ${currentRound + 1}`}
            </Button>
            <Button
              type='button'
              variant='outline'
              className='min-h-11'
              onClick={() => setReviewing(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type='button'
          variant='outline'
          className='min-h-11'
          onClick={() => setReviewing(true)}
          disabled={pending || remaining === 0}
        >
          Review next pass
        </Button>
      )}
      {error.length === 0 ? null : (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
    </div>
  );
}
