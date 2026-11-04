import Link from 'next/link';
import type { ReactNode } from 'react';

import type { CanonicalTrack } from '@/lib/album/build-version';
import { voteHref } from '@/lib/album/play-path';
import type { AlbumVersionSummary } from '@/lib/album/types';
import { leadingTakes } from '@/lib/votes/tally';
import type { VoteSnapshot } from '@/lib/votes/types';
import { formatSignedScore } from '@/lib/formatters';

export function VoteBoard({
  versions,
  snapshot,
  tracklist,
}: {
  versions: AlbumVersionSummary[];
  snapshot: VoteSnapshot;
  tracklist: readonly CanonicalTrack[];
}) {
  const titleBySlug = new Map(versions.map(version => [version.slug, version.title]));

  return (
    <section className='mt-16'>
      <div className='max-w-2xl space-y-2'>
        <h2 className='font-display text-3xl tracking-tight'>The picks</h2>
        <p className='text-muted-foreground text-sm leading-relaxed'>
          One vote per take. The chevrons apply to the take you have selected. Same arrow again
          clears it.
        </p>
      </div>
      <ol className='bg-card/60 mt-6 divide-y divide-white/6 rounded-2xl border border-white/8'>
        {tracklist.map(track => {
          const byVersion = snapshot.tallies[track.number] ?? {};
          const leaders = leadingTakes(byVersion);
          const mine = snapshot.mine[track.number] ?? [];
          const leaderCount = leaders[0]?.count ?? 0;

          return (
            <li
              key={track.number}
              className='flex flex-wrap items-baseline justify-between gap-3 px-5 py-3'
            >
              <div className='min-w-0'>
                <p className='truncate text-sm'>
                  <span className='text-muted-foreground mr-3 font-mono text-xs'>
                    {String(track.number).padStart(2, '0')}
                  </span>
                  {track.title}
                </p>
                {mine.length > 0 ? (
                  <p className='text-muted-foreground mt-1 pl-8 text-xs'>
                    You{' '}
                    {joinNodes(
                      mine.map(choice => (
                        <span key={`${choice.versionSlug}-${choice.takeLabel}`}>
                          {choice.value === 1 ? 'upvoted' : 'downvoted'}{' '}
                          <TakeLink
                            versionSlug={choice.versionSlug}
                            versionTitle={titleBySlug.get(choice.versionSlug) ?? choice.versionSlug}
                            trackTitle={track.title}
                            takeLabel={choice.takeLabel}
                          />
                        </span>
                      ))
                    )}
                  </p>
                ) : null}
              </div>
              <p className='text-muted-foreground text-sm'>
                {leaders.length === 0 ? (
                  'No votes yet'
                ) : leaders.length === 1 && leaders[0] !== undefined ? (
                  <TakeLink
                    versionSlug={leaders[0].versionSlug}
                    versionTitle={titleBySlug.get(leaders[0].versionSlug) ?? leaders[0].versionSlug}
                    trackTitle={track.title}
                    takeLabel={leaders[0].takeLabel}
                  >
                    {` · ${formatSignedScore(leaderCount)}`}
                  </TakeLink>
                ) : (
                  <>
                    Tied:{' '}
                    {joinNodes(
                      leaders.map(lead => (
                        <TakeLink
                          key={`${lead.versionSlug}-${lead.takeLabel}`}
                          versionSlug={lead.versionSlug}
                          versionTitle={titleBySlug.get(lead.versionSlug) ?? lead.versionSlug}
                          trackTitle={track.title}
                          takeLabel={lead.takeLabel}
                        />
                      ))
                    )}
                    {` · ${formatSignedScore(leaderCount)}`}
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TakeLink({
  versionSlug,
  versionTitle,
  trackTitle,
  takeLabel,
  children,
}: {
  versionSlug: string;
  versionTitle: string;
  trackTitle: string;
  takeLabel: string;
  children?: ReactNode;
}) {
  return (
    <Link
      href={voteHref({
        title: trackTitle,
        versionSlug,
        takeLabel,
      })}
      className='hover:text-foreground underline-offset-2 hover:underline'
    >
      {versionTitle} take {takeLabel}
      {children}
    </Link>
  );
}

function joinNodes(nodes: ReactNode[]): ReactNode {
  const joined: ReactNode[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    if (index > 0) {
      joined.push(', ');
    }
    joined.push(nodes[index]);
  }
  return joined;
}
