import Link from 'next/link';

import { AlbumPlayer } from '@/components/album/AlbumPlayer';
import { loadAlbumConfig } from '@/lib/album/album-config';
import { getPublicListenVersion } from '@/lib/album/listen-store';
import { formatNumberExact } from '@/lib/formatters';
import { loadSettings } from '@/lib/settings/store';
import { withVisibleDetails } from '@/lib/votes/provenance';

export const dynamic = 'force-dynamic';

const MAKE_AN_ALBUM_URL = 'https://github.com/sashakhad/album-kit#make-an-album';
const EMPTY_ALBUM = "This album is empty. Open Grok Bot and say: let's make an album.";

export default async function Home() {
  const [config, settings, version] = await Promise.all([
    loadAlbumConfig(),
    loadSettings(),
    getPublicListenVersion(),
  ]);
  const listen =
    settings.listeningDetails === 'visible'
      ? await withVisibleDetails(version, settings.maskPromptModels)
      : version;
  const hasAudio = listen.tracks.some(track => track.audioUrl !== null);
  const trackCount = config.tracks.filter(track => track.parked !== true).length;

  return (
    <main className='mx-auto max-w-6xl space-y-10 px-6 py-16'>
      <header className='space-y-2'>
        <h1 className='text-4xl font-semibold tracking-tight'>{config.title}</h1>
        {config.artist.length > 0 ? (
          <p className='text-muted-foreground text-lg'>{config.artist}</p>
        ) : null}
      </header>

      {config.tracks.length === 0 ? (
        <p className='rounded-2xl border border-dashed border-white/15 p-5 leading-relaxed'>
          {EMPTY_ALBUM}
        </p>
      ) : (
        <section className='space-y-6'>
          <p className='text-muted-foreground'>
            {trackCount === 1 ? '1 track' : `${formatNumberExact(trackCount)} tracks`}
          </p>
          {hasAudio ? (
            <AlbumPlayer version={listen} surface='listen' voter='listener' />
          ) : (
            <p className='rounded-2xl border border-dashed border-white/15 p-5 leading-relaxed'>
              Takes show up here as soon as they can play.
            </p>
          )}
          <div className='flex flex-wrap gap-3'>
            <Link
              href='/listen'
              className='bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-12 items-center rounded-xl px-5 py-2 text-sm font-medium'
            >
              Listen
            </Link>
            <Link
              href='/vote'
              className='inline-flex min-h-12 items-center rounded-xl border border-white/15 px-5 py-2 text-sm font-medium hover:bg-white/6'
            >
              Compare takes
            </Link>
          </div>
        </section>
      )}

      <p className='text-muted-foreground text-sm'>
        <a href={MAKE_AN_ALBUM_URL} className='hover:text-foreground underline underline-offset-2'>
          How to make an album with this kit
        </a>
      </p>
    </main>
  );
}
