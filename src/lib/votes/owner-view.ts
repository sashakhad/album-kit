import 'server-only';

import { OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { loadSettings } from '@/lib/settings/store';
import { blindSnapshot, blindVersion } from '@/lib/votes/blind';
import { safeVoteSnapshot } from '@/lib/votes/board';
import { allTakesVoted, markExposed, wasExposed } from '@/lib/votes/exposure';
import { getConsolidatedPass } from '@/lib/votes/pass-store';
import { withVisibleDetails } from '@/lib/votes/provenance';

export async function ownerJudgingView() {
  const [settings, pass, originalVotes] = await Promise.all([
    loadSettings(),
    getConsolidatedPass(OWNER_VISITOR_ID),
    safeVoteSnapshot(OWNER_VISITOR_ID),
  ]);
  const { version: originalVersion, versions } = pass;
  const revealReady =
    settings.listeningDetails === 'reveal-after-vote' &&
    allTakesVoted(originalVersion, originalVotes);
  const exposedBefore = await wasExposed(OWNER_VISITOR_ID, originalVotes.currentRound);
  const blind =
    settings.listeningDetails === 'keep-hidden' ||
    (settings.listeningDetails === 'reveal-after-vote' && !revealReady && !exposedBefore);
  if (!blind) await markExposed(OWNER_VISITOR_ID, originalVotes.currentRound);
  const version = blind
    ? await blindVersion(originalVersion, originalVotes.currentRound)
    : await withVisibleDetails(originalVersion, settings.maskPromptModels);
  const votes = blind ? await blindSnapshot(originalVotes) : originalVotes;
  const total = versions.reduce(
    (count, set) => count + set.tracks.reduce((sum, track) => sum + track.takes.length, 0),
    0
  );
  const remaining = originalVersion.tracks.reduce((count, track) => count + track.takes.length, 0);
  const parked = originalVersion.tracks.reduce(
    (count, track) => count + (track.parkedTakes?.length ?? 0),
    0
  );
  return {
    settings,
    originalVersion,
    version,
    votes,
    blind,
    awaitingReveal: settings.listeningDetails === 'reveal-after-vote' && blind,
    passSummary: { total, remaining, parked, dropped: Math.max(0, total - remaining - parked) },
  };
}
