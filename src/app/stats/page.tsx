import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ModelStatsDashboard } from '@/components/stats/ModelStatsDashboard';
import { getListenConfig } from '@/lib/album/listen-store';
import { formatDate, formatDateRange, isAfter, isBefore } from '@/lib/date';
import { formatNumber } from '@/lib/formatters';
import { isOwner, OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';
import { getConsolidatedPass } from '@/lib/votes/pass-store';
import { countForTake } from '@/lib/votes/tally';
import {
  albumHeadline,
  chartRows,
  promptModelLabel,
  trackModelCells,
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
  const dates: Date[] = [];
  for (const take of source) {
    const createdAt = byFile.get(take.filename)?.createdAt;
    if (createdAt instanceof Date) {
      dates.push(createdAt);
    }
  }
  const span = takeSpan(dates);
  const passLabel = `Pass ${formatNumber(view.votes.currentRound)}`;
  const rows = chartRows(takes);
  const cells = trackModelCells(takes);
  const headline = albumHeadline(takes);

  return (
    <main className='mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6 sm:py-8'>
      <header className='flex flex-wrap items-end justify-between gap-x-4 gap-y-2'>
        <div className='min-w-0 space-y-1'>
          <p className='text-muted-foreground text-xs'>
            {span === null ? passLabel : `${passLabel} · ${span}`}
          </p>
          <h1 className='font-display text-2xl tracking-tight sm:text-3xl'>Model stats</h1>
        </div>
        <Link
          href='/vote'
          className='text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-sm underline underline-offset-4'
        >
          Compare takes
        </Link>
      </header>
      {takes.length === 0 ? (
        <p className='text-muted-foreground rounded-2xl border border-dashed border-white/15 p-5 text-sm'>
          No uploaded takes yet.
        </p>
      ) : (
        <>
          <ModelStatsDashboard
            headline={headline}
            rows={hidden ? [] : rows}
            cells={hidden ? [] : cells}
            showCharts={!hidden}
          />
          {hidden ? (
            <div className='rounded-2xl border border-white/12 bg-white/4 p-5'>
              <h2 className='text-sm font-semibold'>Model assignments are hidden</h2>
              <p className='text-muted-foreground mt-1 text-sm leading-relaxed'>
                Reveal this pass, or turn off the model mask, to see how each prompt writer scored.
              </p>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

function takeSpan(dates: readonly Date[]): string | null {
  const first = dates[0];
  if (first === undefined) {
    return null;
  }
  let earliest = first;
  let latest = first;
  for (const date of dates) {
    if (isBefore(date, earliest)) {
      earliest = date;
    }
    if (isAfter(date, latest)) {
      latest = date;
    }
  }
  if (formatDate(earliest) === formatDate(latest)) {
    return formatDate(earliest);
  }
  return formatDateRange(earliest.toISOString(), latest.toISOString());
}
