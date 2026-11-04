import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

import { findLetterConflict, letterConflictMessage } from '@/lib/album/blob-audio';
import { parseCanonicalTake } from '@/lib/album/parse-filename';
import { isOwnerRequest } from '@/lib/owner/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TAKE_BYTES = 52428800;

class UploadRejected extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 409
  ) {
    super(message);
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isHandleUploadBody(body)) {
    return NextResponse.json({ error: 'Bad upload request' }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      async onBeforeGenerateToken(pathname) {
        if (!isOwnerRequest(request)) {
          throw new UploadRejected('Owner key required', 401);
        }
        const filename = pathname.startsWith('takes/') ? pathname.slice('takes/'.length) : '';
        const take = parseCanonicalTake(filename);
        if (take === null) {
          throw new UploadRejected(
            'Pathname must be takes/ plus a canonical take filename, like takes/v1-07-track-seven-p3-takee.mp3',
            400
          );
        }
        const existing = await findLetterConflict(take, filename);
        if (existing !== null) {
          throw new UploadRejected(letterConflictMessage(take, existing), 409);
        }
        return {
          allowedContentTypes: ['audio/mpeg'],
          maximumSizeInBytes: MAX_TAKE_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
      async onUploadCompleted() {},
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UploadRejected) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Upload token failed', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

function isHandleUploadBody(value: unknown): value is HandleUploadBody {
  if (typeof value !== 'object' || value === null || !('type' in value) || !('payload' in value)) {
    return false;
  }
  return (
    (value.type === 'blob.generate-client-token' || value.type === 'blob.upload-completed') &&
    typeof value.payload === 'object' &&
    value.payload !== null
  );
}
