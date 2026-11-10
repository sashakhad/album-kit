import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';

import { SiteHeader } from '@/components/album/SiteHeader';
import { loadAlbumConfig } from '@/lib/album/album-config';
import { isOwner } from '@/lib/owner/auth';
import { loadSettings } from '@/lib/settings/store';
import { canViewAlbum } from '@/lib/settings/access';
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

  return (
    <html lang='en' className={`dark ${geistSans.variable} ${geistMono.variable}`}>
      <body className='font-sans antialiased'>
        <SiteHeader
          albumTitle={canViewAlbum(settings.visibility, owner, viewer) ? title : 'Private album'}
          isOwner={owner}
        />
        {children}
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
