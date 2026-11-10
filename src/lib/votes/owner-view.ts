import 'server-only';

import { OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { loadSettings } from '@/lib/settings/store';
import { blindSnapshot, blindVersion } from '@/lib/votes/blind';
import { safeVoteSnapshot } from '@/lib/votes/board';
import { allTakesVoted, markExposed, wasExposed } from '@/lib/votes/exposure';
import { getConsolidatedPassVersion } from '@/lib/votes/pass-store';
import { withVisibleDetails } from '@/lib/votes/provenance';

export async function ownerJudgingView() {
  const [settings, originalVersion, originalVotes] = await Promise.all([
    loadSettings(),
    getConsolidatedPassVersion(OWNER_VISITOR_ID),
    safeVoteSnapshot(OWNER_VISITOR_ID),
  ]);
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
    : await withVisibleDetails(originalVersion);
  const votes = blind ? await blindSnapshot(originalVotes) : originalVotes;
  return {
    settings,
    originalVersion,
    version,
    votes,
    blind,
    awaitingReveal: settings.listeningDetails === 'reveal-after-vote' && blind,
  };
}
