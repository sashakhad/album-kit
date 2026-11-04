import { head, list } from '@vercel/blob';

import { isAudioFilename, parseTakeLabel, type CanonicalTake } from '@/lib/album/parse-filename';
import { blobPathnameFor } from '@/lib/album/paths';

const TAKES_PREFIX = 'takes/';

export function canUseBlob(): boolean {
  return isSet(process.env.BLOB_READ_WRITE_TOKEN) || isSet(process.env.BLOB_STORE_ID);
}

export async function resolveBlobAudioUrl(args: { filename: string }): Promise<string | null> {
  const pathname = blobPathnameFor(args.filename);
  if (pathname === null || !canUseBlob()) {
    return null;
  }

  try {
    const blob = await head(pathname);
    return blob.url;
  } catch {
    return null;
  }
}

export async function listBlobTakeFilenames(): Promise<string[]> {
  if (!canUseBlob()) {
    return [];
  }

  const filenames: string[] = [];
  let cursor: string | undefined;

  try {
    do {
      const result = await list(
        cursor === undefined ? { prefix: TAKES_PREFIX } : { prefix: TAKES_PREFIX, cursor }
      );
      for (const blob of result.blobs) {
        const filename = blob.pathname.split('/').pop();
        if (filename !== undefined && isAudioFilename(filename)) {
          filenames.push(filename);
        }
      }
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor !== undefined);
  } catch {
    return [];
  }

  return filenames;
}

// Letters are never reused, so a second file for the same set, track and letter is refused.
export async function findLetterConflict(
  take: Pick<CanonicalTake, 'setId' | 'trackNumber' | 'letter'>,
  filename: string
): Promise<string | null> {
  const prefix = `${TAKES_PREFIX}${take.setId}-${String(take.trackNumber).padStart(2, '0')}-`;
  let cursor: string | undefined;

  do {
    const result = await list(cursor === undefined ? { prefix } : { prefix, cursor });
    for (const blob of result.blobs) {
      const existing = blob.pathname.slice(TAKES_PREFIX.length);
      if (existing !== filename && parseTakeLabel(existing) === take.letter) {
        return existing;
      }
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor !== undefined);

  return null;
}

export function letterConflictMessage(
  take: Pick<CanonicalTake, 'setId' | 'trackNumber' | 'letter'>,
  existing: string
): string {
  const track = String(take.trackNumber).padStart(2, '0');
  return `Take ${take.letter} of track ${track} in set ${take.setId} already exists as ${existing}. Letters are never reused, so give this file the next free letter.`;
}

function isSet(value: string | undefined): boolean {
  return value !== undefined && value.length > 0;
}
