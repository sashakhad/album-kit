import 'server-only';
import { OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { listenerAudioUrl } from '@/lib/album/stream-url';
import { viewerInviteId } from '@/lib/owner/viewer';
import type { AlbumSettingsValue } from '@/lib/settings/schema';
import { getVoteSnapshot } from '@/lib/votes/board';
import { blindSnapshot, blindVersion, opaqueAudioId } from '@/lib/votes/blind';
import { getConsolidatedPassVersion, getVisitorCurrentRound } from '@/lib/votes/pass-store';
import { isBlindForListenerSnapshot, markExposed } from '@/lib/votes/exposure';
import { withVisibleDetails } from '@/lib/votes/provenance';
import {
  inviteListenerVisitorId,
  listenerIdFromPage,
  publicListenerVisitorId,
} from '@/lib/votes/listener-id';
import { EMPTY_VOTE_SNAPSHOT } from '@/lib/votes/types';
import type { AlbumTake, AlbumVersion } from '@/lib/album/types';

export function withListenerPlayback(version: AlbumVersion, round: number): AlbumVersion {
  const add = (take: AlbumTake) => ({
    ...take,
    audioUrl: listenerAudioUrl(
      take.audioUrl,
      `/api/blind-audio/${round}/${opaqueAudioId(round, take.filename)}`
    ),
  });
  return {
    ...version,
    tracks: version.tracks.map(track => {
      const takes = track.takes.map(add);
      return {
        ...track,
        takes,
        audioUrl: takes[0]?.audioUrl ?? null,
        ...(track.parkedTakes === undefined ? {} : { parkedTakes: track.parkedTakes.map(add) }),
      };
    }),
  };
}

/** Called only after the page has checked listener access. */
export async function listenerJudgingView(
  settings: Pick<AlbumSettingsValue, 'visibility' | 'listeningDetails'>
) {
  const [originalVersion, round, inviteId, publicId] = await Promise.all([
    getConsolidatedPassVersion(OWNER_VISITOR_ID),
    getVisitorCurrentRound(OWNER_VISITOR_ID),
    settings.visibility === 'private' ? viewerInviteId() : Promise.resolve(null),
    listenerIdFromPage(),
  ]);
  const visitorId =
    inviteId !== null
      ? inviteListenerVisitorId(inviteId)
      : publicId !== null
        ? publicListenerVisitorId(publicId)
        : '';
  const originalVotes =
    visitorId.length === 0
      ? { ...EMPTY_VOTE_SNAPSHOT, currentRound: round }
      : await getVoteSnapshot(visitorId, { round, carry: false });
  const blind = await isBlindForListenerSnapshot(
    visitorId,
    settings.listeningDetails,
    originalVotes,
    originalVersion
  );
  if (!blind && visitorId.length > 0) await markExposed(visitorId, round);
  const version = blind
    ? await blindVersion(originalVersion, round)
    : withListenerPlayback(await withVisibleDetails(originalVersion), round);
  return {
    originalVersion,
    version,
    votes: blind ? await blindSnapshot(originalVotes) : originalVotes,
    blind,
    awaitingReveal: settings.listeningDetails === 'reveal-after-vote' && blind,
  };
}
