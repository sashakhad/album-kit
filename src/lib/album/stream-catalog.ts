import 'server-only';

import { isPlayableStream, resolvedClipId, type StreamCatalogEntry } from '@/lib/album/stream-url';
import { prisma } from '@/lib/prisma';

export async function loadStreamCatalog(): Promise<StreamCatalogEntry[]> {
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.length === 0) {
    return [];
  }

  const rows = await prisma.takeProvenance.findMany({
    select: { filename: true, clipId: true, outputId: true, streamUrl: true },
  });
  const catalog: StreamCatalogEntry[] = [];
  for (const row of rows) {
    const clipId = resolvedClipId(row);
    const streamUrl = row.streamUrl;
    // Suno CDN MP3, or the public clip MP4 at cdnN.suno.ai/<clip-id>.mp4.
    if (clipId !== null && streamUrl !== null && isPlayableStream(streamUrl, clipId)) {
      catalog.push({ filename: row.filename, clipId, streamUrl });
    }
  }
  return catalog;
}
