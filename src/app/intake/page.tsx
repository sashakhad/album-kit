import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { IntakeDropzone } from '@/components/intake/IntakeDropzone';
import { canUseBlob } from '@/lib/album/blob-audio';
import { isOwner } from '@/lib/owner/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Intake',
};

export default async function IntakePage() {
  if (!(await isOwner())) {
    redirect(`/key?next=${encodeURIComponent('/intake')}`);
  }

  return (
    <main className='mx-auto max-w-3xl space-y-6 px-6 py-12'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-semibold tracking-tight'>Intake</h1>
        <p className='text-muted-foreground text-sm leading-relaxed'>
          Drop takes named like <code>v1-07-track-seven-p3-takee.mp3</code>. Names that don&apos;t
          match are listed with the reason and skipped.
        </p>
      </header>
      {canUseBlob() ? null : (
        <p className='rounded-md border p-4 text-sm leading-relaxed'>
          Vercel Blob isn&apos;t set up here, so uploads will fail. Run <code>pnpm setup:site</code>
          , or copy takes into <code>album/audio/</code> for local dev.
        </p>
      )}
      <IntakeDropzone access={process.env.BLOB_ACCESS === 'private' ? 'private' : 'public'} />
    </main>
  );
}
