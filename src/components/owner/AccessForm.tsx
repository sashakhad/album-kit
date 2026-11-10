'use client';

import { useEffect, useState } from 'react';

export function AccessForm() {
  const [message, setMessage] = useState(
    'Opening your invitation. You will land on Listen, or on Vote if the owner has allowed listener voting.'
  );
  useEffect(() => {
    const token = window.location.hash.slice(1);
    window.history.replaceState(window.history.state, '', '/access');
    if (token.length === 0) return;
    void fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async response => {
        if (!response.ok)
          throw new Error(
            'This invitation has expired or was already used. Ask the owner for a new link.'
          );
        const body: unknown = await response.json().catch(() => null);
        const next =
          typeof body === 'object' && body !== null && 'next' in body && body.next === '/vote'
            ? '/vote'
            : '/listen';
        window.location.replace(next);
      })
      .catch(error => setMessage(error instanceof Error ? error.message : 'Access failed.'));
  }, []);
  return (
    <p role='status' className='text-muted-foreground text-sm'>
      {message}
    </p>
  );
}
