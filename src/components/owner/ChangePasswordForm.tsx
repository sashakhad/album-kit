'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ChangePasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = data.get('password');
    const confirm = data.get('confirm');
    if (typeof password !== 'string' || typeof confirm !== 'string') return;
    setPending(true);
    setError('');
    setSaved(false);
    try {
      const response = await fetch('/api/owner/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirm }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? 'Your owner session ended. Enter your owner password again, then retry.'
            : typeof result?.error === 'string'
              ? result.error
              : 'Couldn’t save the password. Try again.'
        );
      }
      form.reset();
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Couldn’t save the password. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className='space-y-3'>
      <p className='text-muted-foreground text-sm leading-relaxed'>
        Pick a new owner password. This browser stays signed in. You don’t need the previous
        password. Ask Album Bot to save it so the next deploy keeps it; until then the previous
        password still works.
      </p>
      <label className='block space-y-2 text-sm font-medium'>
        <span>New owner password</span>
        <Input
          type='password'
          name='password'
          autoComplete='new-password'
          autoCapitalize='none'
          spellCheck={false}
          required
          minLength={4}
          maxLength={200}
          disabled={pending}
          className='h-12 text-base'
        />
      </label>
      <label className='block space-y-2 text-sm font-medium'>
        <span>Enter it again</span>
        <Input
          type='password'
          name='confirm'
          autoComplete='new-password'
          autoCapitalize='none'
          spellCheck={false}
          required
          minLength={4}
          maxLength={200}
          disabled={pending}
          className='h-12 text-base'
        />
      </label>
      <Button type='submit' disabled={pending} className='min-h-11'>
        {pending ? 'Saving…' : 'Change password'}
      </Button>
      {saved ? (
        <p role='status' className='text-sm'>
          Password saved on this site. This browser stays signed in.
        </p>
      ) : null}
      {error.length === 0 ? null : (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
    </form>
  );
}
