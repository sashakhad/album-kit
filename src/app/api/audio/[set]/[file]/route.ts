import { promises as fs } from 'node:fs';
import { get } from '@vercel/blob';

import { resolveBlobAudioUrl } from '@/lib/album/blob-audio';
import { parseByteRange } from '@/lib/album/byte-range';
import { isListenFile } from '@/lib/album/listen';
import { getListenConfig } from '@/lib/album/listen-store';
import { contentTypeForFilename } from '@/lib/album/parse-filename';
import { blobPathnameFor, defaultAlbumRoot, resolveAudioCandidates } from '@/lib/album/paths';
import { loadStreamCatalog } from '@/lib/album/stream-catalog';
import { isOwnerRequest } from '@/lib/owner/auth';
import { loadSettings } from '@/lib/settings/store';
import { canViewAlbum } from '@/lib/settings/access';
import { isViewerRequest } from '@/lib/owner/viewer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PUBLIC_CACHE = 'public, max-age=3600';
const OWNER_CACHE = 'private, no-store';

type AudioRouteContext = {
  params: Promise<{
    set: string;
    file: string;
  }>;
};

export async function GET(request: Request, context: AudioRouteContext) {
  return serveAudio(request, context);
}

export async function serveAudio(
  request: Request,
  context: AudioRouteContext,
  options: { allowUnpinned?: boolean } = {}
) {
  const { set, file } = await context.params;
  const config = await getListenConfig();
  const contentType = contentTypeForFilename(file);
  if (!config.sets.some(item => item.id === set) || !file.startsWith(`${set}-`)) {
    return notFound();
  }
  const candidates = resolveAudioCandidates({ albumRoot: defaultAlbumRoot(), filename: file });
  if (candidates.length === 0 || contentType === null) {
    return notFound();
  }

  const owner = await isOwnerRequest(request);
  const settings = await loadSettings();
  const viewer =
    settings.visibility === 'private' && !owner ? await isViewerRequest(request) : false;
  if (!canViewAlbum(settings.visibility, owner, viewer)) return notFound();
  const pinned = isListenFile(config, set, file);
  if (!owner && !pinned && options.allowUnpinned !== true) {
    return Response.json({ error: 'Owner password required' }, { status: 401 });
  }
  const cacheControl = settings.visibility === 'public' && pinned ? PUBLIC_CACHE : OWNER_CACHE;

  const found = await firstExistingFile(candidates);
  if (found === null) {
    const streamUrl =
      (await loadStreamCatalog()).find(entry => entry.filename === file)?.streamUrl ?? null;
    if (streamUrl !== null) {
      return streamFromBlob(request, streamUrl, cacheControl);
    }
    if (process.env.BLOB_ACCESS === 'private') {
      const pathname = blobPathnameFor(file);
      if (pathname === null) return notFound();
      const range = request.headers.get('range');
      const blob = await get(pathname, {
        access: 'private',
        ...(range === null ? {} : { headers: { range } }),
      });
      if (blob === null || blob.statusCode !== 200) return notFound();
      const contentRange = blob.headers.get('content-range');
      return new Response(blob.stream, {
        status: contentRange === null ? 200 : 206,
        headers: {
          'Content-Type': blob.blob.contentType,
          'Content-Length': blob.headers.get('content-length') ?? String(blob.blob.size),
          'Accept-Ranges': blob.headers.get('accept-ranges') ?? 'bytes',
          ...(contentRange === null ? {} : { 'Content-Range': contentRange }),
          'Cache-Control': cacheControl,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    const remoteUrl = await resolveBlobAudioUrl({ filename: file });
    if (remoteUrl === null) {
      return notFound();
    }
    return streamFromBlob(request, remoteUrl, cacheControl);
  }

  const { absolutePath, size } = found;

  const rangeHeader = request.headers.get('range');
  if (rangeHeader !== null) {
    const range = parseByteRange(rangeHeader, size);
    if (range === null) {
      return new Response('Unsatisfiable range', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${size}`,
        },
      });
    }

    const body = toBlobPart(await readFileSlice(absolutePath, range.start, range.end));
    return new Response(new Blob([body], { type: contentType }), {
      status: 206,
      headers: audioHeaders({
        contentType,
        contentLength: range.end - range.start + 1,
        contentRange: `bytes ${range.start}-${range.end}/${size}`,
        cacheControl,
      }),
    });
  }

  const body = toBlobPart(await fs.readFile(absolutePath));
  return new Response(new Blob([body], { type: contentType }), {
    status: 200,
    headers: audioHeaders({
      contentType,
      contentLength: size,
      cacheControl,
    }),
  });
}

// Signed-out listeners get the bytes through this route so the Blob store's host never reaches them.
async function streamFromBlob(
  request: Request,
  blobUrl: string,
  cacheControl: string
): Promise<Response> {
  const range = request.headers.get('range');
  const upstream = await fetch(blobUrl, range === null ? {} : { headers: { range } });

  if (upstream.status === 416) {
    const contentRange = upstream.headers.get('content-range');
    return new Response('Unsatisfiable range', {
      status: 416,
      headers: contentRange === null ? {} : { 'Content-Range': contentRange },
    });
  }
  if ((upstream.status !== 200 && upstream.status !== 206) || upstream.body === null) {
    return notFound();
  }

  const headers = new Headers({
    'Content-Type': upstream.headers.get('content-type') ?? 'audio/mpeg',
    'Accept-Ranges': upstream.headers.get('accept-ranges') ?? 'bytes',
    'Cache-Control': cacheControl,
  });
  for (const name of ['content-length', 'content-range']) {
    const value = upstream.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

function notFound(): Response {
  return Response.json({ error: 'Not found' }, { status: 404 });
}

async function readFileSlice(filePath: string, start: number, end: number): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r');
  try {
    const length = end - start + 1;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return buffer;
  } finally {
    await handle.close();
  }
}

async function firstExistingFile(
  candidates: string[]
): Promise<{ absolutePath: string; size: number } | null> {
  for (const absolutePath of candidates) {
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isFile()) {
        return { absolutePath, size: stat.size };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function toBlobPart(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
}

function audioHeaders(args: {
  contentType: string;
  contentLength: number;
  contentRange?: string;
  cacheControl: string;
}): Headers {
  const headers = new Headers({
    'Content-Type': args.contentType,
    'Content-Length': String(args.contentLength),
    'Accept-Ranges': 'bytes',
    'Cache-Control': args.cacheControl,
  });

  if (args.contentRange !== undefined) {
    headers.set('Content-Range', args.contentRange);
  }

  return headers;
}
