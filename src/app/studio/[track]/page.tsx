import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { CopyButton } from '@/components/studio/CopyButton';
import { RevealStudioButton } from '@/components/studio/RevealStudioButton';
import { loadAlbumConfig } from '@/lib/album/album-config';
import { parseTrackSheet } from '@/lib/album/parse-sheet';
import { defaultAlbumRoot } from '@/lib/album/paths';
import { formatNumberExact } from '@/lib/formatters';
import { isOwner, OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { loadSettings } from '@/lib/settings/store';
import { getVisitorCurrentRound } from '@/lib/votes/pass-store';
import { wasExposed } from '@/lib/votes/exposure';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STYLE_LIMIT = 900;

type StudioPageProps = {
  params: Promise<{ track: string }>;
};

export const metadata: Metadata = {
  title: 'Studio',
};

export default async function StudioPage({ params }: StudioPageProps) {
  const { track: slug } = await params;
  if (!(await isOwner())) {
    redirect(`/key?next=${encodeURIComponent(`/studio/${slug}`)}`);
  }

  const config = await loadAlbumConfig();
  const track = config.tracks.find(item => item.slug === slug);
  if (track === undefined) {
    notFound();
  }

  const settingsValue = await loadSettings();
  const round = await getVisitorCurrentRound(OWNER_VISITOR_ID);
  if (
    settingsValue.listeningDetails !== 'visible' &&
    !(await wasExposed(OWNER_VISITOR_ID, round))
  ) {
    return (
      <main className='mx-auto max-w-3xl space-y-4 px-6 py-12'>
        <h1 className='text-2xl font-semibold'>Studio details are hidden</h1>
        <p className='text-muted-foreground text-sm'>
          Opening the prompts ends blindness for this listening round. This exposure is recorded
          with later votes.
        </p>
        <RevealStudioButton />
      </main>
    );
  }

  const markdown = await readTrackSheet(track.number, track.slug);
  if (markdown === null) {
    notFound();
  }
  const sheet = parseTrackSheet(markdown);
  const settings = Object.entries(sheet.settings);

  return (
    <main className='mx-auto max-w-4xl space-y-10 px-6 py-12'>
      <header className='space-y-1'>
        <p className='text-primary/80 text-xs tracking-[0.2em] uppercase'>
          Track {String(track.number).padStart(2, '0')}
        </p>
        <h1 className='text-3xl font-semibold tracking-tight'>
          {sheet.title.length > 0 ? sheet.title : track.title}
        </h1>
      </header>

      {settings.length > 0 ? (
        <section className='space-y-3'>
          <h2 className='text-lg font-medium'>Settings</h2>
          <dl className='bg-card/60 divide-y divide-white/6 rounded-2xl border border-white/8'>
            {settings.map(([key, value]) => (
              <div key={key} className='flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3'>
                <dt className='text-muted-foreground w-32 shrink-0 text-sm'>{key}</dt>
                <dd className='min-w-0 flex-1 font-mono text-sm break-words'>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className='space-y-3'>
        <h2 className='text-lg font-medium'>Prompts</h2>
        {sheet.prompts.length === 0 ? (
          <p className='text-muted-foreground text-sm'>This sheet has no prompts yet.</p>
        ) : (
          <ol className='space-y-4'>
            {sheet.prompts.map(prompt => (
              <li
                key={prompt.lane}
                className='bg-card/60 space-y-3 rounded-2xl border border-white/8 p-4'
              >
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <h3 className='font-medium'>
                    <span className='text-muted-foreground mr-2 font-mono text-sm'>
                      {prompt.lane}
                    </span>
                    {prompt.name}
                  </h3>
                  <div className='flex items-center gap-3'>
                    <span
                      className={cn(
                        'font-mono text-xs',
                        prompt.style.length >= STYLE_LIMIT
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      )}
                    >
                      {formatNumberExact(prompt.style.length)} characters
                    </span>
                    <CopyButton text={prompt.style} label={`${prompt.lane} style`} />
                  </div>
                </div>
                <p className='text-sm leading-relaxed whitespace-pre-line'>{prompt.style}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className='space-y-3'>
        <h2 className='text-lg font-medium'>Canonical files</h2>
        {sheet.files.length === 0 ? (
          <p className='text-muted-foreground text-sm'>This sheet lists no files yet.</p>
        ) : (
          <div className='overflow-x-auto rounded-2xl border border-white/8'>
            <table className='w-full text-left text-sm'>
              <thead className='text-muted-foreground text-xs tracking-wide uppercase'>
                <tr>
                  <th className='px-4 py-2 font-medium'>Take</th>
                  <th className='px-4 py-2 font-medium'>File</th>
                  <th className='px-4 py-2 font-medium'>Prompt</th>
                  <th className='px-4 py-2' />
                </tr>
              </thead>
              <tbody className='divide-y divide-white/6'>
                {sheet.files.map(file => (
                  <tr key={file.file}>
                    <td className='px-4 py-2 font-mono'>{file.take}</td>
                    <td className='px-4 py-2 font-mono break-all'>{file.file}</td>
                    <td className='px-4 py-2 font-mono'>{file.prompt}</td>
                    <td className='px-4 py-2 text-right'>
                      <CopyButton text={file.file} label={file.file} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

async function readTrackSheet(number: number, slug: string): Promise<string | null> {
  const filename = `${String(number).padStart(2, '0')}-${slug}.md`;
  try {
    return await fs.readFile(path.join(defaultAlbumRoot(), 'tracks', filename), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
