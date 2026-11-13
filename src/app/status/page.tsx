import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { formatNumberExact } from '@/lib/formatters';
import { isOwner } from '@/lib/owner/auth';
import { loadAlbumProgress } from '@/lib/rounds/load-progress';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Progress' };

export default async function StatusPage() {
  if (!(await isOwner())) {
    redirect('/key?next=/status');
  }

  const progress = await loadAlbumProgress();

  return (
    <main className='mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-10'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-semibold tracking-tight'>Progress</h1>
        <p role='status' className='text-sm leading-relaxed'>
          {progress.line}
        </p>
      </header>
      {progress.tracks.length === 0 ? (
        <p className='text-muted-foreground rounded-2xl border border-dashed border-white/15 p-5 text-sm'>
          Track counts show up here once a round has prompts.
        </p>
      ) : (
        <ol className='bg-card/60 divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/10'>
          {progress.tracks.map(track => (
            <li
              key={track.trackNumber}
              className='flex min-h-14 items-center justify-between gap-4 px-4 py-3 text-sm'
            >
              <span className='min-w-0 break-words'>
                <span className='text-muted-foreground mr-3 font-mono text-xs'>
                  {padTrackNumber(track.trackNumber)}
                </span>
                {track.title}
              </span>
              <span className='text-muted-foreground shrink-0 text-xs'>
                {formatNumberExact(track.ready)} of {formatNumberExact(track.expected)} ready
              </span>
            </li>
          ))}
        </ol>
      )}
      <Link
        href='/vote'
        className='inline-flex min-h-11 items-center text-sm underline underline-offset-4'
      >
        Compare takes
      </Link>
    </main>
  );
}

function padTrackNumber(number: number): string {
  return String(number).padStart(2, '0');
}
