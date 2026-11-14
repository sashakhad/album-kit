import { NextResponse } from 'next/server';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { requireOwner } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';
import { loadSettings } from '@/lib/settings/store';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const [album, settings, rounds] = await Promise.all([
    loadAlbumConfig(),
    loadSettings(),
    prisma.generationRound.findMany({
      where: { status: { not: 'complete' } },
      select: { id: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;
  return NextResponse.json(
    {
      version: 1,
      repository: owner && slug ? `https://github.com/${owner}/${slug}` : null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      kitSource: 'https://github.com/sashakhad/album-kit',
      kitRevision: process.env.ALBUM_KIT_REVISION ?? null,
      album: {
        title: album.title,
        genre: album.genre,
        tracks: album.tracks.map(track => ({
          number: track.number,
          title: track.title,
          slug: track.slug,
        })),
      },
      settings,
      incompleteRounds: rounds,
      note: 'Open the same user-owned project in Cursor. Verify available prompt models from Cursor runtime records before claiming a comparison. This handoff contains no credentials or approvals.',
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
