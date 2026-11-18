import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultAlbumRoot } from '@/lib/album/paths';

import {
  isPlayableStream,
  publicStreamEntries,
  resolvedClipId,
  type StreamCatalogEntry,
} from '@/lib/album/stream-url';
import { prisma } from '@/lib/prisma';

export async function loadStreamCatalog(): Promise<StreamCatalogEntry[]> {
  let published: StreamCatalogEntry[];
  try {
    const file = await readFile(path.join(defaultAlbumRoot(), 'public-streams.json'), 'utf8');
    published = publicStreamEntries(JSON.parse(file));
  } catch (error) {
    if (!(
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ))
      throw error;
    published = [];
  }
  if (!process.env.DATABASE_URL) return published;

  const rows = await prisma.takeProvenance.findMany({
    select: { filename: true, clipId: true, outputId: true, streamUrl: true },
  });
  const catalog = new Map(published.map(take => [take.filename, take]));
  for (const row of rows) {
    const clipId = resolvedClipId(row);
    if (!clipId) continue;
    if (row.streamUrl && isPlayableStream(row.streamUrl, clipId)) {
      catalog.set(row.filename, { filename: row.filename, clipId, streamUrl: row.streamUrl });
    } else if (catalog.get(row.filename)?.clipId !== clipId) {
      // An existing generation record owns this filename even when its stream needs a refresh.
      catalog.delete(row.filename);
    }
  }
  return [...catalog.values()];
}
