'use client';

import { CopyButton } from '@/components/studio/CopyButton';

export function OwnerKeyControls({ albumKeyValue }: { albumKeyValue: string }) {
  return (
    <section className='space-y-3 rounded-2xl border border-white/10 p-5'>
      <h2 className='text-xl font-medium'>Your album key</h2>
      <p className='text-muted-foreground text-sm'>
        This key signs you in on another browser or phone. It is how you vote, upload, and move
        takes. Other people do not use it.
      </p>
      <div className='flex flex-wrap items-center gap-2'>
        <input
          readOnly
          value={albumKeyValue}
          aria-label='Album key'
          className='min-w-0 flex-1 rounded-md border border-white/15 bg-transparent px-3 py-2 font-mono text-sm'
        />
        <CopyButton text={albumKeyValue} label='album key' />
      </div>
      <p className='text-muted-foreground text-sm'>
        To rotate the key, change <code>ALBUM_KEY</code> in your Vercel project environment and
        redeploy. This signs out existing owner sessions. Update your local <code>.album-key</code>{' '}
        copy too.
      </p>
    </section>
  );
}
