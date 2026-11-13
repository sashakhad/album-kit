'use client';

import { useState } from 'react';

import { CopyableValue } from '@/components/owner/CopyableValue';
import { Button } from '@/components/ui/button';

export function OwnerKeyControls() {
  const [key, setKey] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<'key' | 'link' | 'sign-out' | null>(null);
  const [error, setError] = useState('');

  async function request(action: 'key' | 'link' | 'sign-out') {
    if (busy !== null) return;
    setBusy(action);
    setError('');
    try {
      const response =
        action === 'key'
          ? await fetch('/api/owner/key', { cache: 'no-store' })
          : action === 'link'
            ? await fetch('/api/owner/sign-in-links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ next: '/settings' }),
              })
            : await fetch('/api/owner/session', { method: 'DELETE' });
      if (!response.ok) throw new Error();
      if (action === 'sign-out') {
        window.location.replace('/key');
        return;
      }
      const result = await response.json();
      if (action === 'key' && typeof result.key === 'string') setKey(result.key);
      else if (action === 'link' && typeof result.link === 'string') setLink(result.link);
      else throw new Error();
    } catch {
      setError(
        action === 'key'
          ? 'Couldn’t load the album key. Try again.'
          : action === 'link'
            ? 'Couldn’t create a sign-in link. Try again.'
            : 'Couldn’t sign out. Try again.'
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm leading-relaxed'>
        Moving to another browser or phone? Create a link for yourself. It works once and stays
        valid for 7 days. After you open it, this browser stays signed in. Use the listener link in
        Sharing for everyone else.
      </p>
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='outline'
          className='min-h-11'
          disabled={busy !== null}
          onClick={() => void request('link')}
        >
          {busy === 'link'
            ? 'Creating…'
            : link === null
              ? 'Create owner sign-in link'
              : 'Create a new owner link'}
        </Button>
        <Button
          type='button'
          variant='ghost'
          className='min-h-11'
          disabled={busy !== null}
          onClick={() => (key === null ? void request('key') : setKey(null))}
        >
          {busy === 'key' ? 'Loading…' : key === null ? 'Show album key' : 'Hide album key'}
        </Button>
      </div>
      {link === null ? null : <CopyableValue value={link} label='Owner sign-in link' />}
      {key === null ? null : <CopyableValue value={key} label='Album key' />}
      {error.length === 0 ? null : (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      <Button
        type='button'
        variant='ghost'
        className='text-muted-foreground min-h-11'
        disabled={busy !== null}
        onClick={() => void request('sign-out')}
      >
        {busy === 'sign-out' ? 'Signing out…' : 'Sign out of this browser'}
      </Button>
    </div>
  );
}
