import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { IntakeDropzone } from '@/components/intake/IntakeDropzone';
import { canUseBlob } from '@/lib/album/blob-audio';
import { isOwner } from '@/lib/owner/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Upload takes' };

export default async function IntakePage() {
  if (!(await isOwner())) redirect('/key?next=%2Fintake');

  return (
    <main className='mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-12'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-semibold tracking-tight'>Upload takes</h1>
        <p className='text-muted-foreground text-sm leading-relaxed'>
          Grok Bot usually adds your takes for you. You can also add prepared MP3s here.
        </p>
      </header>
      {canUseBlob() ? (
        <>
          <IntakeDropzone access={process.env.BLOB_ACCESS === 'private' ? 'private' : 'public'} />
          <p className='text-muted-foreground text-sm leading-relaxed break-words'>
            Use the take names from Grok Bot so files land on the right track. Example:{' '}
            <code>v1-07-track-seven-p3-takee.mp3</code>.
          </p>
        </>
      ) : (
        <p className='rounded-xl border border-white/10 p-4 text-sm leading-relaxed'>
          Audio storage isn’t connected yet. Ask Grok Bot to finish setting up this album.
        </p>
      )}
      <Link
        href='/vote'
        className='inline-flex min-h-11 items-center text-sm underline underline-offset-4'
      >
        Back to Compare takes
      </Link>
    </main>
  );
}
