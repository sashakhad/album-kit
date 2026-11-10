'use client';

import { useState, useSyncExternalStore } from 'react';

import { CopyButton } from '@/components/studio/CopyButton';
import { shareTarget } from '@/lib/settings/access';
import type { AlbumSettingsValue } from '@/lib/settings/schema';

function subscribeOrigin() {
  return () => undefined;
}

function originSnapshot(): string {
  return window.location.origin;
}

function originServerSnapshot(): string {
  return '';
}

export function ShareControls({
  visibility,
  listenerVoting,
}: {
  visibility: AlbumSettingsValue['visibility'];
  listenerVoting: boolean;
}) {
  const target = shareTarget(visibility, listenerVoting);
  const origin = useSyncExternalStore(subscribeOrigin, originSnapshot, originServerSnapshot);
  const url =
    target.path === null || target.invite || origin.length === 0 ? '' : `${origin}${target.path}`;
  const [message, setMessage] = useState('');

  async function share() {
    if (url.length === 0) {
      return;
    }
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url });
        setMessage('Share sheet opened.');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link copied.');
    } catch {
      setMessage('Copy the link from the field.');
    }
  }

  return (
    <section className='space-y-3 rounded-2xl border border-white/10 p-5'>
      <h2 className='text-xl font-medium'>Share</h2>
      <p className='text-muted-foreground text-sm'>{shareCopy(target.grant, target.invite)}</p>
      {url.length > 0 ? (
        <div className='flex flex-wrap items-center gap-2'>
          <input
            readOnly
            value={url}
            aria-label='Share link'
            className='min-w-0 flex-1 rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm'
          />
          <CopyButton text={url} label='share link' />
          <button
            type='button'
            onClick={() => void share()}
            className='rounded-full border border-white/15 px-4 py-2 text-sm'
          >
            Share
          </button>
        </div>
      ) : null}
      <p role='status' className='text-muted-foreground text-sm'>
        {message}
      </p>
    </section>
  );
}

function shareCopy(grant: 'unavailable' | 'listen' | 'listen-and-vote', invite: boolean): string {
  if (grant === 'unavailable') {
    return 'Choose public or private before sharing. Until then, only you can open the album, with your album key.';
  }
  if (invite && grant === 'listen-and-vote') {
    return 'This album is private. Create an invitation below. The secret stays after #. Opening it lets that person hear pinned takes and vote. It does not include your album key.';
  }
  if (invite) {
    return 'This album is private. Create an invitation below. The secret stays after #. Opening it lets that person hear pinned takes. Listener voting is off, so they cannot score takes.';
  }
  if (grant === 'listen-and-vote') {
    return 'Anyone with this link can open Vote, hear the takes in the current round, and add a listener score. Your scores, pins, Studio, and Settings stay yours. The link does not include your album key.';
  }
  return 'Anyone with this link can open Listen and hear pinned takes. They cannot vote. The link does not include your album key.';
}
