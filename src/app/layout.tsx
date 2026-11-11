import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';

import { SiteHeader } from '@/components/album/SiteHeader';
import { loadAlbumConfig } from '@/lib/album/album-config';
import { isOwner } from '@/lib/owner/auth';
import { loadSettings } from '@/lib/settings/store';
import { canCastVote, canViewAlbum } from '@/lib/settings/access';
import { isViewer } from '@/lib/owner/viewer';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const [owner, settings, viewer] = await Promise.all([isOwner(), loadSettings(), isViewer()]);
  if (!canViewAlbum(settings.visibility, owner, viewer))
    return { title: 'Private album', robots: { index: false, follow: false } };
  const { title, artist } = await albumHeading();
  return {
    title: {
      default: title,
      template: `%s · ${title}`,
    },
    ...(artist.length > 0 ? { description: `${title} by ${artist}` } : {}),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const [{ title }, owner, settings, viewer] = await Promise.all([
    albumHeading(),
    isOwner(),
    loadSettings(),
    isViewer(),
  ]);
  const canListen = canViewAlbum(settings.visibility, owner, viewer);

  return (
    <html lang='en' className={`dark ${geistSans.variable} ${geistMono.variable}`}>
      <body className='font-sans antialiased'>
        <SiteHeader
          albumTitle={canListen ? title : 'Private album'}
          isOwner={owner}
          showListen={canListen}
          showVote={canCastVote({
            visibility: settings.visibility,
            listenerVoting: settings.listenerVoting,
            owner,
            viewer,
          })}
        />
        {children}
        {canListen && !owner ? (
          <footer className='mx-auto max-w-6xl border-t border-white/8 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6'>
            <Link
              href='/key'
              className='text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-xs underline-offset-4 hover:underline'
            >
              Owner sign-in
            </Link>
          </footer>
        ) : null}
      </body>
    </html>
  );
}

async function albumHeading(): Promise<{ title: string; artist: string }> {
  try {
    const config = await loadAlbumConfig();
    return { title: config.title, artist: config.artist };
  } catch {
    return { title: 'Album', artist: '' };
  }
}
