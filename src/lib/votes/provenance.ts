import 'server-only';

import type { AlbumTake, AlbumVersion } from '@/lib/album/types';
import { prisma } from '@/lib/prisma';

export async function withVisibleDetails(
  version: AlbumVersion,
  maskPromptModels = false
): Promise<AlbumVersion> {
  const filenames = version.tracks.flatMap(track => [
    ...track.takes.map(take => take.filename),
    ...(track.parkedTakes ?? []).map(take => take.filename),
  ]);
  const rows = await prisma.takeProvenance.findMany({ where: { filename: { in: filenames } } });
  const byFilename = new Map(rows.map(row => [row.filename, row]));
  const add = (take: AlbumTake): AlbumTake => {
    const row = byFilename.get(take.filename);
    if (row === undefined)
      return {
        ...take,
        details: {
          style: 'Prompt record unavailable',
          writer: 'Writer unverified',
          sunoModel: 'Suno model unverified',
        },
      };
    const writer = maskPromptModels
      ? `${row.writerHost === 'grok-bot' ? 'Grok Bot' : (row.writerProvider ?? 'Cursor')} · model masked`
      : row.writerHost === 'grok-bot'
        ? 'Grok Bot · model undisclosed'
        : row.attribution === 'verified' && row.observedModel !== null
          ? `${row.writerProvider ?? 'Cursor'} · ${row.observedModel}`
          : 'Cursor · model unverified';
    return {
      ...take,
      details: {
        style: row.style,
        writer,
        sunoModel: row.sunoModel ?? 'Suno model unverified',
        ...(row.parentTakeFilename ? { parentTakeFilename: row.parentTakeFilename } : {}),
        ...(row.promptInstructions ? { promptInstructions: row.promptInstructions } : {}),
      },
    };
  };
  return {
    ...version,
    tracks: version.tracks.map(track => ({
      ...track,
      takes: track.takes.map(add),
      ...(track.parkedTakes === undefined ? {} : { parkedTakes: track.parkedTakes.map(add) }),
    })),
  };
}
