'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function KeyForm({ next }: { next: string }) {
  const [ownerLink, setOwnerLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('owner');
    if (token === null) return;
    // Capture the secret once and clear it from the address bar before using it.
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search
    );
    queueMicrotask(() => setOwnerLink(token));
  }, []);

  async function signIn(credentials: { key: string } | { token: string }) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/owner/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (response.ok) {
        window.location.replace(next);
        return;
      }
      if (response.status === 410) {
        setOwnerLink(null);
        setError('This link expired or was already used. Ask Grok Bot for a fresh owner link.');
      } else if (response.status === 401 && 'key' in credentials) {
        setError('That owner password didn’t match. Check it and try again.');
      } else {
        setError('Owner sign-in is unavailable right now. Try again in a moment.');
      }
    } catch {
      setError('Couldn’t reach the album. Try again.');
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = new FormData(event.currentTarget).get('key');
    if (typeof key === 'string') void signIn({ key: key.trim() });
  }

  return (
    <div className='space-y-4'>
      {ownerLink === null ? (
        <form onSubmit={onSubmit} className='space-y-4'>
          <label className='block space-y-2 text-sm font-medium'>
            <span>Owner password</span>
            <Input
              type='password'
              name='key'
              autoComplete='current-password'
              autoCapitalize='none'
              spellCheck={false}
              required
              disabled={pending}
              className='h-12 text-base'
            />
          </label>
          <Button type='submit' disabled={pending} className='min-h-11 w-full'>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      ) : (
        <div className='space-y-2'>
          <Button
            type='button'
            disabled={pending}
            onClick={() => void signIn({ token: ownerLink })}
            className='min-h-11 w-full'
          >
            {pending ? 'Signing in…' : 'Continue as owner'}
          </Button>
          <Button
            type='button'
            variant='ghost'
            disabled={pending}
            onClick={() => {
              setOwnerLink(null);
              setError(null);
            }}
            className='min-h-11 w-full'
          >
            Use owner password instead
          </Button>
        </div>
      )}
      {error === null ? null : (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
    </div>
  );
}
