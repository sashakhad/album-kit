'use client';

import { useState, type MouseEvent } from 'react';
import { Download } from 'lucide-react';

import { isDownloaded } from '@/lib/votes/tally';
import type { VoteSnapshot } from '@/lib/votes/types';
import { cn } from '@/lib/utils';

export function DownloadButton({
  trackNumber,
  versionSlug,
  takeLabel,
  trackTitle,
  audioUrl,
  votes,
  onSnapshot,
}: {
  trackNumber: number;
  versionSlug: string;
  takeLabel: string;
  trackTitle: string;
  audioUrl: string;
  votes: VoteSnapshot;
  onSnapshot?: (snapshot: VoteSnapshot) => void;
}) {
  const [pending, setPending] = useState(false);
  const saved = isDownloaded(votes, trackNumber, versionSlug, takeLabel);

  async function save(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) {
      return;
    }

    setPending(true);
    try {
      triggerFileDownload(audioUrl, `${versionSlug}-${trackTitle}-take-${takeLabel}.mp3`);
      const response = await fetch('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackNumber, versionSlug, takeLabel }),
      });
      if (!response.ok) {
        return;
      }
      const snapshot: unknown = await response.json();
      if (!isVoteSnapshot(snapshot)) {
        return;
      }
      onSnapshot?.(snapshot);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type='button'
      onClick={event => void save(event)}
      disabled={pending}
      aria-pressed={saved}
      aria-label={
        saved
          ? `Saved take ${takeLabel} of ${trackTitle}`
          : `Save take ${takeLabel} of ${trackTitle}`
      }
      className={cn(
        'flex size-10 items-center justify-center rounded-md',
        saved
          ? 'text-primary bg-primary/12'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/6'
      )}
    >
      <Download className='size-4' />
    </button>
  );
}

function triggerFileDownload(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}

function isVoteSnapshot(value: unknown): value is VoteSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return 'tallies' in value && 'mine' in value && 'versionTotals' in value;
}
