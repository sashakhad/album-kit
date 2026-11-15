import { z } from 'zod';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { getSet } from '@/lib/album/load-album';
import { parseCanonicalTake } from '@/lib/album/parse-filename';
import { filenameForOpaqueId } from '@/lib/votes/blind';

export const variationRequestSchema = z
  .object({
    id: z.uuid(),
    trackNumber: z.number().int().min(1).max(99),
    parentTakeFilename: z.string().min(1).optional(),
    parentTakeToken: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .optional(),
    sourceRound: z.number().int().positive().optional(),
    requestedTakes: z.number().int().min(1).max(20),
    instructions: z.string().trim().max(1000).default(''),
  })
  .refine(
    input =>
      (input.parentTakeFilename === undefined) !== (input.parentTakeToken === undefined) &&
      (input.parentTakeToken === undefined) === (input.sourceRound === undefined)
  );

export type VariationInput = z.infer<typeof variationRequestSchema>;

export async function resolveVariationParent(input: VariationInput): Promise<string | null> {
  return (
    input.parentTakeFilename ?? filenameForOpaqueId(input.sourceRound!, input.parentTakeToken!)
  );
}

export async function availableVariationParent(input: VariationInput): Promise<{
  filename: string;
  trackTitle: string;
} | null> {
  const filename = await resolveVariationParent(input);
  const parsed = filename === null ? null : parseCanonicalTake(filename);
  if (filename === null || parsed === null || parsed.trackNumber !== input.trackNumber) return null;
  const [album, set] = await Promise.all([loadAlbumConfig(), getSet(parsed.setId)]);
  const track = album.tracks.find(item => item.number === input.trackNumber);
  if (
    track === undefined ||
    track.slug !== parsed.slug ||
    set?.tracks
      .find(item => item.number === input.trackNumber)
      ?.takes.some(take => take.filename === filename) !== true
  )
    return null;
  return { filename, trackTitle: track.title };
}
