import type { Metadata } from 'next';

import { KeyForm } from '@/components/owner/KeyForm';
import { albumKey, safeNextPath } from '@/lib/owner/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Album key',
};

type KeyPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function KeyPage({ searchParams }: KeyPageProps) {
  const { next } = await searchParams;
  const target = safeNextPath(typeof next === 'string' ? next : undefined);

  return (
    <main className='mx-auto max-w-md space-y-6 px-6 py-16'>
      <div className='space-y-2'>
        <h1 className='text-2xl font-semibold tracking-tight'>Album key</h1>
        <p className='text-muted-foreground text-sm'>
          The key is how the owner votes, uploads and moves takes.
        </p>
      </div>
      {albumKey() === null ? (
        <p className='rounded-md border p-4 text-sm leading-relaxed'>
          This site has no album key yet. Run <code>pnpm setup:site</code> to create one, then come
          back here.
        </p>
      ) : (
        <KeyForm next={target} />
      )}
    </main>
  );
}
