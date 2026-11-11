import Link from 'next/link';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { formatNumberExact } from '@/lib/formatters';
import { isOwner } from '@/lib/owner/auth';
import { loadSettings } from '@/lib/settings/store';
import { canCastVote, canViewAlbum } from '@/lib/settings/access';
import { notFound } from 'next/navigation';
import { isViewer } from '@/lib/owner/viewer';

export const dynamic = 'force-dynamic';

const MAKE_AN_ALBUM_URL = 'https://github.com/sashakhad/album-kit#make-an-album';
const EMPTY_ALBUM = "This album is empty. Open Grok Bot and say: let's make an album.";

export default async function Home() {
  const [config, owner, settings, viewer] = await Promise.all([
    loadAlbumConfig(),
    isOwner(),
    loadSettings(),
    isViewer(),
  ]);
  if (!canViewAlbum(settings.visibility, owner, viewer)) notFound();
  const trackCount = config.tracks.filter(track => track.parked !== true).length;

  return (
    <main className='mx-auto max-w-3xl space-y-10 px-6 py-16'>
      <header className='space-y-2'>
        <h1 className='text-4xl font-semibold tracking-tight'>{config.title}</h1>
        {config.artist.length > 0 ? (
          <p className='text-muted-foreground text-lg'>{config.artist}</p>
        ) : null}
      </header>

      {config.tracks.length === 0 ? (
        <p className='rounded-2xl border border-dashed border-white/15 p-5 leading-relaxed'>
          {owner ? EMPTY_ALBUM : 'Music is on the way. Check back soon.'}
        </p>
      ) : (
        <section className='space-y-4'>
          <p className='text-muted-foreground'>
            {trackCount === 1 ? '1 track' : `${formatNumberExact(trackCount)} tracks`}
          </p>
          <div className='flex flex-wrap gap-3'>
            <Link
              href='/listen'
              className='bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-12 items-center rounded-xl px-5 py-2 text-sm font-medium'
            >
              Listen now
            </Link>
            {canCastVote({
              visibility: settings.visibility,
              listenerVoting: settings.listenerVoting,
              owner,
              viewer,
            }) ? (
              <Link
                href='/vote'
                className='inline-flex min-h-12 items-center rounded-xl border border-white/15 px-5 py-2 text-sm font-medium hover:bg-white/6'
              >
                Compare takes
              </Link>
            ) : null}
            {owner ? (
              <Link
                href='/final'
                className='rounded-lg border border-white/15 px-5 py-2 text-sm font-medium hover:bg-white/6'
              >
                Final picks
              </Link>
            ) : null}
          </div>
        </section>
      )}

      {owner ? (
        <p className='text-muted-foreground text-sm'>
          <a
            href={MAKE_AN_ALBUM_URL}
            className='hover:text-foreground underline underline-offset-2'
          >
            How to make an album with this kit
          </a>
        </p>
      ) : null}
    </main>
  );
}
