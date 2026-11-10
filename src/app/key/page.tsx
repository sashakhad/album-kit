import type { Metadata } from 'next';
import Link from 'next/link';

import { KeyForm } from '@/components/owner/KeyForm';
import { OwnerKeyControls } from '@/components/owner/OwnerKeyControls';
import { albumKey, isOwner, safeNextPath } from '@/lib/owner/auth';
import { keyPageCopy } from '@/lib/settings/key-copy';
import { loadSettings } from '@/lib/settings/store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Album key',
};

type KeyPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function KeyPage({ searchParams }: KeyPageProps) {
  const { next } = await searchParams;
  const requested = typeof next === 'string' ? next : '';
  const target = safeNextPath(requested.length === 0 ? undefined : requested);

  if (albumKey() === null) {
    return (
      <main className='mx-auto max-w-md space-y-6 px-6 py-16'>
        <div className='space-y-2'>
          <h1 className='text-2xl font-semibold tracking-tight'>Album key</h1>
          <p className='text-muted-foreground text-sm'>
            The album key is how the owner scores takes, uploads audio, and moves takes.
          </p>
        </div>
        <p className='rounded-md border p-4 text-sm leading-relaxed'>
          This site has no album key yet. Run <code>pnpm setup:site</code> to create one, then come
          back here.
        </p>
      </main>
    );
  }

  if (await isOwner()) {
    return (
      <main className='mx-auto max-w-md space-y-6 px-6 py-16'>
        <OwnerKeyControls albumKeyValue={albumKey() ?? ''} />
        <Link href={target} className='inline-block text-sm underline underline-offset-2'>
          Continue
        </Link>
      </main>
    );
  }

  const settings = await loadSettings().catch(() => null);
  const copy = keyPageCopy({
    next: requested,
    visibility: settings?.visibility ?? 'unset',
    listenerVoting: settings?.listenerVoting ?? false,
  });

  return (
    <main className='mx-auto max-w-md space-y-6 px-6 py-16'>
      <div className='space-y-3'>
        <h1 className='text-2xl font-semibold tracking-tight'>{copy.title}</h1>
        {copy.paragraphs.map(paragraph => (
          <p key={paragraph} className='text-muted-foreground text-sm leading-relaxed'>
            {paragraph}
          </p>
        ))}
      </div>
      {copy.listenHref === null && copy.voteHref === null ? null : (
        <div className='flex flex-wrap gap-3'>
          {copy.listenHref === null ? null : (
            <Link
              href={copy.listenHref}
              className='bg-primary text-primary-foreground rounded-full px-4 py-2 text-sm font-medium'
            >
              Listen
            </Link>
          )}
          {copy.voteHref === null ? null : (
            <Link
              href={copy.voteHref}
              className='rounded-full border border-white/15 px-4 py-2 text-sm font-medium'
            >
              Vote
            </Link>
          )}
        </div>
      )}
      <div className='space-y-3'>
        <p className='text-sm font-medium'>Owner sign-in</p>
        <KeyForm next={target} />
      </div>
    </main>
  );
}
