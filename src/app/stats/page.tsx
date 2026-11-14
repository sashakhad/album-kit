import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getListenConfig } from '@/lib/album/listen-store';
import { formatSignedScore } from '@/lib/formatters';
import { isOwner, OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';
import { getConsolidatedPass } from '@/lib/votes/pass-store';
import { countForTake } from '@/lib/votes/tally';
import { EMPTY_VOTE_SNAPSHOT, type TrackTallies } from '@/lib/votes/types';
import {
  promptModelLabel,
  summarizeModels,
  type ModelSummary,
  type ModelTake,
} from '@/lib/votes/model-stats';
import { ownerJudgingView } from '@/lib/votes/owner-view';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Model stats' };

export default async function StatsPage() {
  if (!(await isOwner())) redirect('/key?next=%2Fstats');
  const [view, pass, config, provenance] = await Promise.all([
    ownerJudgingView(),
    getConsolidatedPass(OWNER_VISITOR_ID),
    getListenConfig(),
    prisma.takeProvenance.findMany(),
  ]);
  const hidden = view.blind || view.settings.maskPromptModels;
  const source = pass.versions.flatMap(set =>
    set.tracks.flatMap(track =>
      track.takes.map(take => ({ ...take, trackNumber: track.number, trackTitle: track.title }))
    )
  );
  const parked = new Set(
    pass.version.tracks.flatMap(track => (track.parkedTakes ?? []).map(take => take.filename))
  );
  const active = new Set(
    pass.version.tracks.flatMap(track => track.takes.map(take => take.filename))
  );
  const picked = new Set<string>();
  for (const track of config.tracks) {
    if (track.listen) {
      const chosen = source.find(
        take =>
          take.trackNumber === track.number &&
          take.versionSlug === track.listen?.set &&
          take.voteLabel === track.listen.take
      );
      if (chosen) picked.add(chosen.filename);
    } else {
      const choices = pass.version.tracks.find(item => item.number === track.number)?.takes ?? [];
      const best = Math.max(
        0,
        ...choices.map(take =>
          countForTake(view.votes, track.number, take.versionSlug, take.voteLabel)
        )
      );
      if (best > 0)
        for (const take of choices) {
          if (countForTake(view.votes, track.number, take.versionSlug, take.voteLabel) === best)
            picked.add(take.filename);
        }
    }
    if (track.vip) {
      const vip = source.find(
        take =>
          take.trackNumber === track.number &&
          take.versionSlug === track.vip?.set &&
          take.voteLabel === track.vip.take
      );
      if (vip) picked.add(vip.filename);
    }
  }
  const byFile = new Map(provenance.map(row => [row.filename, row]));
  const takes: ModelTake[] = source.map(take => ({
    filename: take.filename,
    trackNumber: take.trackNumber,
    trackTitle: take.trackTitle,
    model: promptModelLabel(byFile.get(take.filename)),
    score: active.has(take.filename)
      ? countForTake(view.votes, take.trackNumber, take.versionSlug, take.voteLabel)
      : null,
    picked: picked.has(take.filename),
    cut: !active.has(take.filename) && !parked.has(take.filename),
    parked: parked.has(take.filename),
  }));
  const models = summarizeModels(takes);
  const trackNumbers = [...new Set(takes.map(take => take.trackNumber))].sort((a, b) => a - b);

  return (
    <main className='mx-auto max-w-6xl space-y-8 px-4 py-7 sm:px-6 sm:py-10'>
      <header className='space-y-2'>
        <Link
          href='/vote'
          className='text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-sm underline underline-offset-4'
        >
          ← Compare takes
        </Link>
        <h1 className='font-display text-3xl tracking-tight sm:text-4xl'>Prompt model stats</h1>
        <p className='text-muted-foreground max-w-3xl text-sm leading-relaxed'>
          Pass {view.votes.currentRound}. Likes count active takes with a positive owner score.
          Current score sums only active takes; cuts count takes removed by an earlier pass. Picks
          include manual choices and ties for the highest positive owner score. One take counts once
          in each category.
        </p>
      </header>
      <ListenerVoteList takes={source} tallies={view.votes.listenerTallies} />
      {hidden ? (
        <div className='rounded-2xl border border-white/12 bg-white/4 p-6'>
          <h2 className='font-semibold'>Model assignments are hidden</h2>
          <p className='text-muted-foreground mt-2 text-sm'>
            Your current listening detail or model mask setting hides identities for this pass.
            Reveal the pass or change the owner setting to inspect model charts.
          </p>
        </div>
      ) : takes.length === 0 ? (
        <p className='text-muted-foreground'>No uploaded takes yet.</p>
      ) : (
        <>
          <div className='grid gap-4 lg:grid-cols-3'>
            <ModelChart
              title='Liked takes'
              explanation='Positive owner score / active takes'
              models={models}
              value={row => row.liked}
              denominator={row => row.active}
            />
            <ModelChart
              title='Cuts'
              explanation='Removed before this pass / all takes'
              models={models}
              value={row => row.cuts}
              denominator={row => row.takes}
            />
            <ModelChart
              title='Listen picks'
              explanation='Chosen takes / all takes'
              models={models}
              value={row => row.picks}
              denominator={row => row.takes}
            />
          </div>
          <section className='space-y-3'>
            <h2 className='text-xl font-semibold'>Current owner scores</h2>
            <p className='text-muted-foreground text-xs'>
              Scores can change with repeated votes and carry into later passes. Compare them with
              active take counts.
            </p>
            <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              {models.map(row => (
                <div key={row.model} className='rounded-xl border border-white/12 bg-white/4 p-4'>
                  <p className='truncate text-sm' title={row.model}>
                    {row.model}
                  </p>
                  <p className='mt-2 text-2xl font-semibold tabular-nums'>
                    {row.score > 0 ? '+' : ''}
                    {row.score}
                  </p>
                  <p className='text-muted-foreground text-xs'>
                    {row.active} active {row.active === 1 ? 'take' : 'takes'}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className='space-y-3'>
            <h2 className='text-xl font-semibold'>By track</h2>
            <div className='overflow-x-auto rounded-2xl border border-white/12'>
              <table className='w-full min-w-[42rem] text-left text-sm'>
                <thead className='bg-white/5 text-xs'>
                  <tr>
                    <th className='p-3'>Track</th>
                    <th className='p-3'>Prompt model</th>
                    <th className='p-3'>Takes</th>
                    <th className='p-3'>Liked</th>
                    <th className='p-3'>Cuts</th>
                    <th className='p-3'>Picks</th>
                    <th className='p-3'>Current score</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-white/8'>
                  {trackNumbers.flatMap(number =>
                    summarizeModels(takes.filter(take => take.trackNumber === number)).map(row => (
                      <tr key={`${number}-${row.model}`}>
                        <th scope='row' className='p-3 font-medium'>
                          {String(number).padStart(2, '0')} ·{' '}
                          {takes.find(take => take.trackNumber === number)?.trackTitle}
                        </th>
                        <td className='p-3'>{row.model}</td>
                        <td className='p-3 tabular-nums'>{row.takes}</td>
                        <td className='p-3 tabular-nums'>
                          {row.liked}/{row.active}
                        </td>
                        <td className='p-3 tabular-nums'>{row.cuts}</td>
                        <td className='p-3 tabular-nums'>{row.picks}</td>
                        <td className='p-3 tabular-nums'>
                          {row.score > 0 ? '+' : ''}
                          {row.score}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className='space-y-3'>
            <h2 className='text-xl font-semibold'>Every take</h2>
            <p className='text-muted-foreground text-xs'>
              Set and canonical take letters identify each uploaded file. A negative current score
              is cut only when the next pass starts.
            </p>
            <div className='overflow-x-auto rounded-2xl border border-white/12'>
              <table className='w-full min-w-[38rem] text-left text-sm'>
                <thead className='bg-white/5 text-xs'>
                  <tr>
                    <th className='p-3'>Track</th>
                    <th className='p-3'>Take</th>
                    <th className='p-3'>Prompt model</th>
                    <th className='p-3'>Status</th>
                    <th className='p-3'>Current score</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-white/8'>
                  {takes.map((take, index) => (
                    <tr key={take.filename}>
                      <th scope='row' className='p-3 font-medium'>
                        {String(take.trackNumber).padStart(2, '0')} · {take.trackTitle}
                      </th>
                      <td className='p-3 font-mono text-xs'>
                        {source[index]?.versionSlug} · {source[index]?.voteLabel}
                      </td>
                      <td className='p-3'>{take.model}</td>
                      <td className='p-3'>
                        {take.picked
                          ? 'Chosen for Listen'
                          : take.cut
                            ? 'Cut'
                            : take.parked
                              ? 'Parked'
                              : take.score !== null && take.score < 0
                                ? 'Cut next pass'
                                : 'In this pass'}
                      </td>
                      <td className='p-3 font-mono tabular-nums'>
                        {take.score === null ? '—' : `${take.score > 0 ? '+' : ''}${take.score}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function ListenerVoteList({
  takes,
  tallies,
}: {
  takes: readonly {
    filename: string;
    trackNumber: number;
    trackTitle: string;
    versionSlug: string;
    voteLabel: string;
  }[];
  tallies: TrackTallies | undefined;
}) {
  const snapshot = { ...EMPTY_VOTE_SNAPSHOT, tallies: tallies ?? {} };
  const rows: {
    filename: string;
    trackNumber: number;
    trackTitle: string;
    versionSlug: string;
    voteLabel: string;
    score: number;
  }[] = [];
  for (const take of takes) {
    const score = countForTake(snapshot, take.trackNumber, take.versionSlug, take.voteLabel);
    if (score === 0) {
      continue;
    }
    rows.push({ ...take, score });
  }

  return (
    <section className='space-y-3' aria-labelledby='listener-votes-heading'>
      <h2 id='listener-votes-heading' className='text-xl font-semibold'>
        Listener votes
      </h2>
      <p className='text-muted-foreground text-xs'>
        Listener ballots stay listed here whether or not listeners can vote.
      </p>
      {rows.length === 0 ? (
        <p className='text-muted-foreground text-sm'>No listener votes yet.</p>
      ) : (
        <div className='overflow-x-auto rounded-2xl border border-white/12'>
          <table className='w-full min-w-[28rem] text-left text-sm'>
            <thead className='bg-white/5 text-xs'>
              <tr>
                <th className='p-3'>Track</th>
                <th className='p-3'>Take</th>
                <th className='p-3'>Listener score</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-white/8'>
              {rows.map(row => (
                <tr key={row.filename}>
                  <th scope='row' className='p-3 font-medium'>
                    {String(row.trackNumber).padStart(2, '0')} · {row.trackTitle}
                  </th>
                  <td className='p-3 font-mono text-xs'>
                    {row.versionSlug} · {row.voteLabel}
                  </td>
                  <td className='p-3 font-mono tabular-nums'>{formatSignedScore(row.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ModelChart({
  title,
  explanation,
  models,
  value,
  denominator,
}: {
  title: string;
  explanation: string;
  models: ModelSummary[];
  value: (model: ModelSummary) => number;
  denominator: (model: ModelSummary) => number;
}) {
  return (
    <section className='space-y-4 rounded-2xl border border-white/12 bg-white/4 p-4 sm:p-5'>
      <div>
        <h2 className='font-semibold'>{title}</h2>
        <p className='text-muted-foreground text-xs'>{explanation}</p>
      </div>
      <div className='space-y-4'>
        {models.map(row => {
          const count = value(row);
          const total = denominator(row);
          const percent = total === 0 ? 0 : Math.min(100, (count / total) * 100);
          return (
            <div key={row.model} className='space-y-1.5'>
              <div className='flex items-start justify-between gap-2 text-xs'>
                <span className='min-w-0 break-words'>{row.model}</span>
                <span className='shrink-0 font-mono tabular-nums'>
                  {count}/{total}
                </span>
              </div>
              <div
                className='h-2 rounded-full bg-white/10'
                role='img'
                aria-label={`${row.model}: ${count} of ${total}`}
              >
                <div className='bg-primary h-full rounded-full' style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
