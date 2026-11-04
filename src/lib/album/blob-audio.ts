import { head, list } from '@vercel/blob';

import { isAudioFilename } from '@/lib/album/parse-filename';
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

function isSet(value: string | undefined): boolean {
  return value !== undefined && value.length > 0;
}
