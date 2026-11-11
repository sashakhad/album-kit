'use client';

import { useEffect, useRef, useState } from 'react';

export function AccessForm() {
  const [message, setMessage] = useState('Opening your invitation…');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    if (token.length === 0) {
      queueMicrotask(() => setMessage('Open the full invitation link from the album owner.'));
      return;
    }
    window.history.replaceState(window.history.state, '', '/access');
    void fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(response => {
        if (response.ok) window.location.replace('/listen');
        else
          setMessage(
            'This invitation expired or was already used. Ask the album owner for a new link.'
          );
      })
      .catch(() => setMessage('Couldn’t reach the album. Open the invitation again to retry.'));
  }, []);

  return (
    <p role='status' className='text-muted-foreground text-sm leading-relaxed'>
      {message}
    </p>
  );
}
