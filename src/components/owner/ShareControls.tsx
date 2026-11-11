'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { CopyableValue } from '@/components/owner/CopyableValue';

function subscribeOrigin() {
  return () => undefined;
}

function originSnapshot() {
  return window.location.origin;
}

function originServerSnapshot() {
  return '';
}

export function ShareControls({ listenerVoting }: { listenerVoting: boolean }) {
  const origin = useSyncExternalStore(subscribeOrigin, originSnapshot, originServerSnapshot);

  return (
    <div className='space-y-2 rounded-xl border border-white/8 bg-white/3 p-4'>
      <p className='text-sm font-medium'>Listener link</p>
      <p className='text-muted-foreground text-sm leading-relaxed'>
        {listenerVoting
          ? 'Anyone with this link can hear final picks and previews, then compare takes. Their scores stay separate from yours.'
          : 'Anyone with this link can hear the takes you choose in Final picks. Allow listener voting to share previews before you make picks.'}
      </p>
      {origin.length > 0 ? (
        <CopyableValue value={`${origin}/listen`} label='Listener link' />
      ) : null}
      <Link
        href='/listen'
        className='text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-sm underline underline-offset-4'
      >
        Open Listen
      </Link>
    </div>
  );
}
