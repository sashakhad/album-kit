'use client';

import { useState } from 'react';

export function OwnerContinue({ next }: { next: string }) {
  const [message, setMessage] = useState('This browser can generate takes.');

  function continueFromLink() {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('owner');
    if (token === null) {
      setMessage('Ask Album Bot for your owner link.');
      return;
    }
    void fetch('/api/owner/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(response => {
        if (response.ok) {
          const path = `${window.location.pathname}${window.location.search}`;
          window.history.replaceState(null, '', path);
          window.location.assign(next);
          return;
        }
        setMessage('This link was already used. Ask Album Bot for a new one.');
      })
      .catch(() => {
        setMessage('Couldn’t open this link. Try it again.');
      });
  }

  return (
    <div className='space-y-4'>
      <p role='status' className='text-muted-foreground text-sm leading-relaxed'>
        {message}
      </p>
      <button
        type='button'
        onClick={continueFromLink}
        className='bg-foreground text-background min-h-11 rounded-lg px-4 text-sm font-medium'
      >
        Continue
      </button>
    </div>
  );
}
