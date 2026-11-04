import { constants as fsConstants, promises as fs } from 'node:fs';

import { BlobNotFoundError, copy, del, head } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { canUseBlob } from '@/lib/album/blob-audio';
import { defaultAlbumRoot, resolveAudioFile } from '@/lib/album/paths';
import { requireOwner } from '@/lib/owner/auth';
import { getPrisma } from '@/lib/prisma';
import { moveTake, type MoveTakeBlob } from '@/lib/votes/move-take';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const moveBodySchema = z.object({
  from: z.string(),
  to: z.string(),
  keepSource: z.boolean().optional(),
  replace: z.boolean().optional(),
});

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) {
    return denied;
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = moveBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad move' }, { status: 400 });
  }

  try {
    const result = await moveTake(
      { db: getPrisma(), blob: canUseBlob() ? blobTakes() : localTakes() },
      parsed.data
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Moving a take failed', error);
    return NextResponse.json({ error: 'move failed' }, { status: 500 });
  }
}

function blobTakes(): MoveTakeBlob {
  return {
    async find(pathname) {
      try {
        const blob = await head(pathname);
        return { url: blob.url };
      } catch (error) {
        if (error instanceof BlobNotFoundError) {
          return null;
        }
        throw error;
      }
    },
    async copy(fromUrl, toPathname) {
      await copy(fromUrl, toPathname, { access: 'public', addRandomSuffix: false });
    },
    async remove(urlOrPathname) {
      await del(urlOrPathname);
    },
  };
}

// Local dev keeps takes in album/audio/ (spec 3.7), so moves work on those files instead.
function localTakes(): MoveTakeBlob {
  function localFile(urlOrPathname: string): string {
    const filename = urlOrPathname.replace(/^takes\//, '');
    const file = resolveAudioFile({ albumRoot: defaultAlbumRoot(), filename });
    if (file === null) {
      throw new Error(`Not a take file: ${urlOrPathname}`);
    }
    return file;
  }

  return {
    async find(pathname) {
      try {
        const stat = await fs.stat(localFile(pathname));
        return stat.isFile() ? { url: pathname } : null;
      } catch {
        return null;
      }
    },
    async copy(fromUrl, toPathname) {
      await fs.copyFile(localFile(fromUrl), localFile(toPathname), fsConstants.COPYFILE_EXCL);
    },
    async remove(urlOrPathname) {
      await fs.rm(localFile(urlOrPathname), { force: true });
    },
  };
}
