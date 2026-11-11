import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';

import { KeyForm } from '@/components/owner/KeyForm';
import { albumKey, isOwner, safeNextPath } from '@/lib/owner/auth';
import { isViewer } from '@/lib/owner/viewer';
import { keyPageCopy } from '@/lib/settings/key-copy';
import { loadSettings } from '@/lib/settings/store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Owner sign-in',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

type KeyPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function KeyPage({ searchParams }: KeyPageProps) {
  const { next } = await searchParams;
  const target = safeNextPath(typeof next === 'string' ? next : undefined, '/settings');
  const destination = /^\/key(?:[/?#]|$)/.test(target) ? '/settings' : target;
  if (await isOwner()) redirect(destination);

  const [settings, viewer] = await Promise.all([loadSettings().catch(() => null), isViewer()]);
  const copy = keyPageCopy({
    next: destination,
    visibility: settings?.visibility ?? 'unset',
    listenerVoting: settings?.listenerVoting ?? false,
    viewer,
  });

  return (
    <main className='mx-auto max-w-md space-y-5 px-4 py-10 sm:px-6 sm:py-16'>
      <section className='bg-card/60 space-y-5 rounded-2xl border border-white/12 p-5 sm:p-7'>
        <KeyRound aria-hidden='true' className='text-muted-foreground size-5' />
        <header className='space-y-2'>
          <h1 className='text-2xl font-semibold tracking-tight'>Sign in as owner</h1>
          <p className='text-muted-foreground text-sm leading-relaxed'>
            {albumKey() === null
              ? 'This album hasn’t finished setup. Ask Grok Bot to finish setting up your site.'
              : 'Open the owner link from Grok Bot, or enter your album key here.'}
          </p>
        </header>
        {albumKey() === null ? null : <KeyForm next={destination} />}
      </section>
      {copy.listenerNote === null ? null : (
        <p className='text-muted-foreground px-1 text-sm leading-relaxed'>{copy.listenerNote}</p>
      )}
      {copy.listen ? (
        <div className='flex flex-wrap items-center gap-x-5 px-1'>
          <Link
            href='/listen'
            className='inline-flex min-h-11 items-center text-sm underline underline-offset-4'
          >
            Back to Listen
          </Link>
          {copy.compare ? (
            <Link
              href='/vote'
              className='inline-flex min-h-11 items-center text-sm underline underline-offset-4'
            >
              Compare as a listener
            </Link>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
