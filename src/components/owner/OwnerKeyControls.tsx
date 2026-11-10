'use client';

import { useState } from 'react';

export function OwnerKeyControls() {
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  async function reveal() {
    const response = await fetch('/api/owner/key', { cache: 'no-store' });
    if (!response.ok) {
      setMessage('Could not retrieve the key.');
      return;
    }
    const result = await response.json();
    setKey(result.key ?? '');
    setMessage('Use this key to sign in on another device. Keep it private.');
  }
  return (
    <section className='space-y-3 rounded-2xl border border-white/10 p-5'>
      <h2 className='text-xl font-medium'>Owner access</h2>
      <p className='text-muted-foreground text-sm'>
        The owner key controls voting, uploads and Settings. You can recover it here while signed
        in.
      </p>
      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          onClick={() => void reveal()}
          className='rounded-full border border-white/15 px-4 py-2 text-sm'
        >
          View key
        </button>
        {key.length > 0 ? (
          <button
            type='button'
            onClick={() => void navigator.clipboard.writeText(key)}
            className='rounded-full border border-white/15 px-4 py-2 text-sm'
          >
            Copy key
          </button>
        ) : null}
      </div>
      {key.length > 0 ? <p className='font-mono text-sm break-all'>{key}</p> : null}
      <p role='status' className='text-muted-foreground text-sm'>
        {message}
      </p>
      <p className='text-muted-foreground text-sm'>
        To rotate the key, change <code>ALBUM_KEY</code> in your Vercel project environment and
        redeploy. This signs out existing owner sessions. Update your local <code>.album-key</code>{' '}
        copy too.
      </p>
    </section>
  );
}
