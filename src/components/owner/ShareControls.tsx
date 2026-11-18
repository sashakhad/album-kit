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

export function ShareControls() {
  const origin = useSyncExternalStore(subscribeOrigin, originSnapshot, originServerSnapshot);

  return (
    <div className='space-y-2 rounded-xl border border-white/8 bg-white/3 p-4'>
      <p className='text-sm font-medium'>Album link</p>
      {origin.length > 0 ? <CopyableValue value={`${origin}/vote`} label='Album link' /> : null}
      <Link
        href='/vote'
        className='text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-sm underline underline-offset-4'
      >
        Open Compare takes
      </Link>
    </div>
  );
}
