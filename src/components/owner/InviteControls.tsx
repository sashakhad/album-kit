'use client';

import { useEffect, useState } from 'react';

import { CopyableValue } from '@/components/owner/CopyableValue';
import { Button } from '@/components/ui/button';

type Invite = {
  id: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  revokedAt: string | null;
};

export function InviteControls({ listenerVoting }: { listenerVoting: boolean }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [issued, setIssued] = useState<{ id: string; link: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/owner/invites', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error();
        setInvites(await response.json());
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Couldn’t load invitations. Reload to try again.');
      });
    return () => controller.abort();
  }, []);

  async function create() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/owner/invites', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || typeof result.link !== 'string') throw new Error();
      setIssued({ id: result.id, link: result.link });
      setInvites(current => [
        {
          id: result.id,
          createdAt: new Date().toISOString(),
          expiresAt: result.expiresAt,
          redeemedAt: null,
          revokedAt: null,
        },
        ...current,
      ]);
    } catch {
      setError('Couldn’t create the invitation. Check your sharing settings and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/owner/invites/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error();
      setInvites(current => current.filter(invite => invite.id !== id));
      setIssued(current => (current?.id === id ? null : current));
    } catch {
      setError('Couldn’t remove access. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const active = invites.filter(
    invite =>
      invite.revokedAt === null &&
      (invite.redeemedAt !== null || new Date(invite.expiresAt) > new Date())
  );
  return (
    <div className='space-y-3 rounded-xl border border-white/8 bg-white/3 p-4'>
      <h3 className='text-sm font-medium'>Listener invitations</h3>
      <p className='text-muted-foreground text-sm leading-relaxed'>
        {listenerVoting
          ? 'Invite someone to listen and compare takes.'
          : 'Invite someone to hear your final picks.'}{' '}
        Each link works once and expires in 15 minutes. Open it on the browser they’ll use to
        listen.
      </p>
      <Button
        type='button'
        variant='outline'
        disabled={busy}
        onClick={() => void create()}
        className='min-h-11'
      >
        Create listener invitation
      </Button>
      {issued === null ? null : <CopyableValue value={issued.link} label='Listener invitation' />}
      {error.length === 0 ? null : (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      {active.length === 0 ? null : (
        <ul className='divide-y divide-white/8 border-t border-white/8'>
          {active.map(invite => (
            <li key={invite.id} className='flex flex-wrap items-center justify-between gap-1 py-1'>
              <span className='text-muted-foreground text-sm'>
                {invite.redeemedAt === null ? 'Waiting to open' : 'Opened'} ·{' '}
                {new Date(invite.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
              <Button
                type='button'
                variant='ghost'
                disabled={busy}
                onClick={() => void revoke(invite.id)}
                className='min-h-11 text-xs'
              >
                Remove access
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
