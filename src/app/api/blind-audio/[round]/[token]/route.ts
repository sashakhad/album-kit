import { serveAudio } from '@/app/api/audio/[set]/[file]/route';
import { parseCanonicalTake } from '@/lib/album/parse-filename';
import { filenameForOpaqueId, opaqueAudioId } from '@/lib/votes/blind';
import { isOwnerRequest, OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { getConsolidatedPassVersion, getVisitorCurrentRound } from '@/lib/votes/pass-store';
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
  const currentRound = await getVisitorCurrentRound(OWNER_VISITOR_ID);
  const owner = isOwnerRequest(request);
  if (!owner && round !== currentRound)
    return Response.json({ error: 'Not found' }, { status: 404 });
  const version =
    round === currentRound ? await getConsolidatedPassVersion(OWNER_VISITOR_ID) : null;
  const available =
    version?.tracks.flatMap(track => [...track.takes, ...(track.parkedTakes ?? [])]) ?? [];
  const filename =
    available.find(take => opaqueAudioId(round, take.filename) === token)?.filename ??
    (owner ? await filenameForOpaqueId(round, token) : null);
  const take = filename === null ? null : parseCanonicalTake(filename);
  if (filename === null || take === null)
    return Response.json({ error: 'Not found' }, { status: 404 });
  return serveAudio(
    request,
    { params: Promise.resolve({ set: take.setId, file: filename }) },
    { allowUnpinned: true }
  );
}
