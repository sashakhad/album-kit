import 'server-only';

import { prisma } from '@/lib/prisma';

export type VariationTrackStatus = {
  status: 'generating' | 'ready' | 'failed';
  reason?: string;
};

export async function loadVariationTrackStatus(): Promise<Record<number, VariationTrackStatus>> {
  const rows = await prisma.variationRequest.findMany({
    where: { status: { in: ['generating', 'ready', 'failed'] } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  const byTrack: Record<number, VariationTrackStatus> = {};
  for (const row of rows) {
    if (byTrack[row.trackNumber] !== undefined) continue;
    if (row.status !== 'generating' && row.status !== 'ready' && row.status !== 'failed') continue;
    const reason =
      row.status === 'failed' && row.dispatchError !== null && row.dispatchError.length > 0
        ? row.dispatchError
        : undefined;
    byTrack[row.trackNumber] =
      reason === undefined ? { status: row.status } : { status: row.status, reason };
  }
  return byTrack;
}
