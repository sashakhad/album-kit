import { serveAudio } from '@/app/api/audio/[set]/[file]/route';
import { getListenVersion, listenAudioToken } from '@/lib/album/listen-store';
import { albumKey } from '@/lib/owner/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const key = albumKey();
  if (key === null || !/^[0-9a-f]{32}$/.test(token)) return notFound();

  const version = await getListenVersion();
  const take = version.tracks
    .flatMap(track => track.takes)
    .find(take => listenAudioToken(key, take.filename) === token);
  if (take === undefined) return notFound();
  return serveAudio(
    request,
    { params: Promise.resolve({ set: take.versionSlug, file: take.filename }) },
    { allowUnpinned: true }
  );
}

function notFound() {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
