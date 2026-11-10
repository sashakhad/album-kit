'use client';

import { useEffect, useState } from 'react';

export function AccessForm() {
  const [message, setMessage] = useState('Open the invitation link the album owner sent you.');
  useEffect(() => {
    const token = window.location.hash.slice(1);
    window.history.replaceState(window.history.state, '', '/access');
    if (token.length === 0) return;
    void fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(response => {
        if (!response.ok)
          throw new Error(
            'This invitation has expired or was already used. Ask the owner for a new link.'
          );
        window.location.replace('/listen');
      })
      .catch(error => setMessage(error instanceof Error ? error.message : 'Access failed.'));
  }, []);
  return (
    <p role='status' className='text-muted-foreground text-sm'>
      {message}
    </p>
  );
}
