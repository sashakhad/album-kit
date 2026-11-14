import {
  formatAverageScore,
  formatNumber,
  formatNumberExact,
  formatPercent,
} from '@/lib/formatters';
import type { AlbumHeadline, ModelChartRow, TrackModelCell } from '@/lib/votes/model-stats';

import { CutRateChart, LikesScoreChart, PicksChart } from './ModelBarCharts';
import { TrackModelHeatmap } from './TrackModelHeatmap';

export function ModelStatsDashboard({
  headline,
  rows,
  cells,
  showCharts = true,
}: {
  headline: AlbumHeadline;
  rows: ModelChartRow[];
  cells: TrackModelCell[];
  showCharts?: boolean;
}) {
  const average = headline.averageScore === null ? '—' : formatAverageScore(headline.averageScore);

  return (
    <div className='space-y-3'>
      <section aria-label='Album totals'>
        <h2 className='sr-only'>Overview</h2>
        <dl className='grid grid-cols-3 gap-2 sm:grid-cols-6'>
          <Stat
            label='Takes'
            value={formatNumber(headline.takes)}
            hint={`${formatNumberExact(headline.takes)} uploaded`}
          />
          <Stat
            label='Liked'
            value={formatNumber(headline.liked)}
            hint={`${formatNumberExact(headline.liked)} positive of ${formatNumberExact(headline.active)} active`}
          />
          <Stat label='Avg score' value={average} hint='Mean score of active takes' />
          <Stat
            label='Cut rate'
            value={formatPercent(headline.cutRate)}
            hint={`${formatNumberExact(headline.cuts)} removed`}
          />
          <Stat
            label='Picks'
            value={formatNumber(headline.picks)}
            hint={`${formatNumberExact(headline.picks)} chosen for Listen or tied for the lead`}
          />
          <Stat
            label='Models'
            value={formatNumber(headline.models)}
            hint={`${formatNumberExact(headline.models)} prompt writers`}
          />
        </dl>
      </section>

      {showCharts ? <ChartSections rows={rows} cells={cells} /> : null}
    </div>
  );
}

function ChartSections({ rows, cells }: { rows: ModelChartRow[]; cells: TrackModelCell[] }) {
  return (
    <>
      <section className='bg-card/60 rounded-2xl border border-white/10 p-3 sm:p-4'>
        <div className='mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
          <h2 className='text-sm font-semibold tracking-tight'>Likes and average score</h2>
          <p className='text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
            <span className='inline-flex items-center gap-1.5'>
              <span className='bg-chart-2 size-2 rounded-full' />
              Likes
            </span>
            <span className='inline-flex items-center gap-1.5'>
              <span className='bg-chart-3 size-2 rounded-full' />
              Avg score
            </span>
          </p>
        </div>
        <ul className='sr-only'>
          {rows.map(function likeSummary(row) {
            const likes = row.liked === 1 ? '1 like' : `${formatNumberExact(row.liked)} likes`;
            const averageText =
              row.averageScore === null
                ? 'no active takes'
                : `average ${formatAverageScore(row.averageScore)}`;
            return (
              <li key={row.model}>
                {row.model}: {likes}, {averageText}
              </li>
            );
          })}
        </ul>
        <LikesScoreChart rows={rows} />
      </section>

      <div className='grid gap-3 lg:grid-cols-2'>
        <section className='bg-card/60 rounded-2xl border border-white/10 p-3 sm:p-4'>
          <div className='mb-2 flex items-baseline justify-between gap-3'>
            <h2 className='text-sm font-semibold tracking-tight'>Cut rate</h2>
            <p className='text-muted-foreground text-xs'>Removed before this pass</p>
          </div>
          <ul className='sr-only'>
            {rows.map(function cutSummary(row) {
              return (
                <li key={row.model}>
                  {row.model}: {formatPercent(row.cutRate)}
                </li>
              );
            })}
          </ul>
          <CutRateChart rows={rows} />
        </section>
        <section className='bg-card/60 rounded-2xl border border-white/10 p-3 sm:p-4'>
          <div className='mb-2 flex items-baseline justify-between gap-3'>
            <h2 className='text-sm font-semibold tracking-tight'>Picks</h2>
            <p className='text-muted-foreground text-xs'>Listen choices and ties</p>
          </div>
          <ul className='sr-only'>
            {rows.map(function pickSummary(row) {
              return (
                <li key={row.model}>
                  {row.model}: {formatNumberExact(row.picks)}
                </li>
              );
            })}
          </ul>
          <PicksChart rows={rows} />
        </section>
      </div>

      <section className='bg-card/60 rounded-2xl border border-white/10 p-3 sm:p-4'>
        <div className='mb-2 flex items-baseline justify-between gap-3'>
          <h2 className='text-sm font-semibold tracking-tight'>By track</h2>
          <p className='text-muted-foreground text-xs'>Average score</p>
        </div>
        <TrackModelHeatmap rows={rows} cells={cells} />
      </section>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div
      className='bg-card/60 min-w-0 rounded-xl border border-white/10 px-2.5 py-2 sm:px-3'
      title={hint}
    >
      <dt className='text-muted-foreground truncate text-xs'>{label}</dt>
      <dd className='truncate text-lg font-semibold tracking-tight tabular-nums sm:text-xl'>
        {value}
      </dd>
    </div>
  );
}
