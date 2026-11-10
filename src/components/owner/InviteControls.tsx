'use client';

import { useEffect, useState } from 'react';

type Invite = {
  id: string;
  expiresAt: string;
  redeemedAt: string | null;
  revokedAt: string | null;
};

export function InviteControls({ listenerVoting }: { listenerVoting: boolean }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [link, setLink] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const response = await fetch('/api/owner/invites');
    if (response.ok) setInvites(await response.json());
  }
  useEffect(() => {
    void fetch('/api/owner/invites')
      .then(response => (response.ok ? response.json() : []))
      .then((rows: Invite[]) => setInvites(rows));
  }, []);

  async function create() {
    const response = await fetch('/api/owner/invites', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? 'Could not create invitation.');
      return;
    }
    setLink(result.link);
    setMessage(
      listenerVoting
        ? 'This link works once and expires in 15 minutes. The secret is after #. Opening it signs the listener in for 30 days, lets them hear pinned takes, and lets them vote. It is not your album key.'
        : 'This link works once and expires in 15 minutes. The secret is after #. Opening it signs the listener in for 30 days so they can hear pinned takes. Listener voting is off, so they cannot score takes.'
    );
    await load();
  }

  async function revoke(id: string) {
    const response = await fetch(`/api/owner/invites/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (response.ok) await load();
  }

  return (
    <section className='space-y-3 rounded-2xl border border-white/10 p-5'>
      <h2 className='text-xl font-medium'>Private invitations</h2>
      <p className='text-muted-foreground text-sm'>
        Create one link per browser or phone. The link secret stays after #, so it is not sent in
        the page request. It grants Listen
        {listenerVoting ? ' and Vote' : ''}. It does not include your album key.
      </p>
      <button
        type='button'
        onClick={() => void create()}
        className='rounded-full border border-white/15 px-4 py-2 text-sm'
      >
        Create invitation
      </button>
      {link.length > 0 ? (
        <div className='flex flex-wrap items-center gap-2'>
          <input
            readOnly
            value={link}
            aria-label='Invitation link'
            className='min-w-0 flex-1 rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm'
          />
          <button
            type='button'
            onClick={() => void navigator.clipboard.writeText(link)}
            className='rounded-full border border-white/15 px-4 py-2 text-sm'
          >
            Copy
          </button>
          <button
            type='button'
            onClick={() => void shareInvite(link)}
            className='rounded-full border border-white/15 px-4 py-2 text-sm'
          >
            Share
          </button>
        </div>
      ) : null}
      <p role='status' className='text-muted-foreground text-sm'>
        {message}
      </p>
      <ul className='space-y-2 text-sm'>
        {invites.map(invite => (
          <li key={invite.id} className='flex items-center justify-between gap-3'>
            <span>
              {invite.revokedAt !== null
                ? 'Revoked'
                : invite.redeemedAt !== null
                  ? 'Opened'
                  : new Date(invite.expiresAt) < new Date()
                    ? 'Expired'
                    : 'Waiting to open'}
            </span>
            {invite.revokedAt === null ? (
              <button type='button' onClick={() => void revoke(invite.id)} className='underline'>
                Revoke
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

async function shareInvite(url: string) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ url });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
    }
  }
  await navigator.clipboard.writeText(url);
}
