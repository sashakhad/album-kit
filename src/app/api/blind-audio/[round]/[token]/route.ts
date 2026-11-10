import { serveAudio } from '@/app/api/audio/[set]/[file]/route';
import { parseCanonicalTake } from '@/lib/album/parse-filename';
import { filenameForOpaqueId } from '@/lib/votes/blind';
import { canPlayBlindTake } from '@/lib/votes/voter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ round: string; token: string }> }
) {
  if (!(await canPlayBlindTake(request)))
    return Response.json({ error: 'Owner key required' }, { status: 401 });
  const { round: rawRound, token } = await context.params;
  const round = Number(rawRound);
  if (!Number.isSafeInteger(round) || round < 1 || !/^[0-9a-f]{32}$/.test(token))
    return Response.json({ error: 'Not found' }, { status: 404 });
  const filename = await filenameForOpaqueId(round, token);
  const take = filename === null ? null : parseCanonicalTake(filename);
  if (filename === null || take === null)
    return Response.json({ error: 'Not found' }, { status: 404 });
  return serveAudio(
    request,
    { params: Promise.resolve({ set: take.setId, file: filename }) },
    { allowUnpinned: true }
  );
}
