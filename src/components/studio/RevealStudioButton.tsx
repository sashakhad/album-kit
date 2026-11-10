'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RevealStudioButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function reveal() {
    setPending(true);
    try {
      const response = await fetch('/api/owner/exposure', { method: 'POST' });
      if (response.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }
  return (
    <button
      type='button'
      disabled={pending}
      onClick={() => void reveal()}
      className='rounded-full border border-white/15 px-4 py-2 text-sm'
    >
      Reveal studio details
    </button>
  );
}
