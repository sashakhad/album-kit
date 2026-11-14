'use client';

import { useState } from 'react';

import { KeyForm } from '@/components/owner/KeyForm';
import { Button } from '@/components/ui/button';

export function ListenerOwnerClaim({ next }: { next: string }) {
  const [open, setOpen] = useState(false);

  function openPrompt() {
    setOpen(true);
  }

  return (
    <section
      aria-label='Listener ballot'
      className='mb-6 space-y-3 rounded-2xl border border-white/12 bg-white/4 p-4 sm:p-5'
    >
      <p className='text-sm leading-relaxed'>
        You’re voting as a listener. These scores stay on a listener ballot, separate from the
        owner’s scores.
      </p>
      {open ? (
        <KeyForm next={next} />
      ) : (
        <Button type='button' className='min-h-11' onClick={openPrompt}>
          I’m the owner
        </Button>
      )}
    </section>
  );
}
