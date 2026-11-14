import { cn } from '@/lib/utils';
import { formatAverageScore, formatNumberExact } from '@/lib/formatters';
import type { ModelChartRow, TrackModelCell } from '@/lib/votes/model-stats';

export function TrackModelHeatmap({
  rows,
  cells,
}: {
  rows: ModelChartRow[];
  cells: TrackModelCell[];
}) {
  const tracks = tracksInOrder(cells);
  const byKey = new Map(cells.map(cell => [`${cell.trackNumber}\u0000${cell.model}`, cell]));
  const maxAbs = maxAbsScore(cells);

  return (
    <div>
      <div className='-mx-1 overflow-x-auto px-1'>
        <table className='w-full table-fixed border-separate border-spacing-1 text-xs'>
          <caption className='sr-only'>Average owner score by track and prompt model</caption>
          <thead>
            <tr>
              <th className='bg-background sticky left-0 z-10 w-24 p-1 sm:w-40' />
              {rows.map(function modelHead(row) {
                return (
                  <th
                    key={row.model}
                    scope='col'
                    title={row.model}
                    className='text-muted-foreground max-w-24 px-1 pb-1 text-center text-[11px] leading-tight font-medium'
                  >
                    <span className='block truncate'>{modelPrimary(row.model)}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {tracks.map(function trackRow(track) {
              const label = `${padTrack(track.trackNumber)} ${track.trackTitle}`;
              return (
                <tr key={track.trackNumber}>
                  <th
                    scope='row'
                    title={label}
                    className='bg-background sticky left-0 z-10 px-1 text-left font-medium'
                  >
                    <span className='flex min-w-0 items-baseline gap-1.5'>
                      <span className='text-muted-foreground shrink-0 font-mono text-[11px]'>
                        {padTrack(track.trackNumber)}
                      </span>
                      <span className='truncate'>{track.trackTitle}</span>
                    </span>
                  </th>
                  {rows.map(function modelCell(row) {
                    const cell = byKey.get(`${track.trackNumber}\u0000${row.model}`);
                    const score = cell?.averageScore ?? null;
                    const scoreText =
                      cell === undefined
                        ? 'no takes'
                        : score === null
                          ? 'no active score'
                          : formatAverageScore(score);
                    const picks = cell?.picks ?? 0;
                    return (
                      <td
                        key={row.model}
                        aria-label={`${label}, ${row.model}, ${scoreText}, ${formatNumberExact(picks)} picks`}
                        className={cn(
                          'h-10 rounded-md px-1 text-center text-xs font-medium tabular-nums',
                          heatClass(cell === undefined ? null : score, maxAbs, picks > 0)
                        )}
                      >
                        {cell === undefined || score === null ? '—' : formatAverageScore(score)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className='text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
        <span className='inline-flex items-center gap-1.5'>
          <span className='bg-chart-5 size-3 rounded-sm' />
          Low
        </span>
        <span className='inline-flex items-center gap-1.5'>
          <span className='size-3 rounded-sm bg-white/10' />
          Zero
        </span>
        <span className='inline-flex items-center gap-1.5'>
          <span className='bg-chart-2 size-3 rounded-sm' />
          High
        </span>
        <span className='inline-flex items-center gap-1.5'>
          <span className='ring-foreground/80 size-3 rounded-sm ring-1 ring-inset' />
          Pick
        </span>
        <span>— no active score</span>
      </div>
    </div>
  );
}

function tracksInOrder(
  cells: readonly TrackModelCell[]
): { trackNumber: number; trackTitle: string }[] {
  const tracks: { trackNumber: number; trackTitle: string }[] = [];
  const seen = new Set<number>();
  const ordered = [...cells].sort((a, b) => a.trackNumber - b.trackNumber);
  for (const cell of ordered) {
    if (seen.has(cell.trackNumber)) {
      continue;
    }
    seen.add(cell.trackNumber);
    tracks.push({ trackNumber: cell.trackNumber, trackTitle: cell.trackTitle });
  }
  return tracks;
}

function maxAbsScore(cells: readonly TrackModelCell[]): number {
  let max = 0;
  for (const cell of cells) {
    if (cell.averageScore !== null) {
      const magnitude = Math.abs(cell.averageScore);
      if (magnitude > max) {
        max = magnitude;
      }
    }
  }
  return max;
}

function heatClass(score: number | null, maxAbs: number, picked: boolean): string {
  const ring = picked ? 'ring-1 ring-foreground/80 ring-inset' : '';
  if (score === null) {
    return cn('bg-white/5 text-muted-foreground', ring);
  }
  if (maxAbs === 0 || score === 0) {
    return cn('bg-white/10 text-foreground', ring);
  }
  const ratio = Math.abs(score) / maxAbs;
  const strong = ratio > 0.66;
  const mid = ratio > 0.33;
  if (score > 0) {
    if (strong) {
      return cn('bg-chart-2 text-background', ring);
    }
    if (mid) {
      return cn('bg-chart-2/60 text-foreground', ring);
    }
    return cn('bg-chart-2/30 text-foreground', ring);
  }
  if (strong) {
    return cn('bg-chart-5 text-background', ring);
  }
  if (mid) {
    return cn('bg-chart-5/60 text-foreground', ring);
  }
  return cn('bg-chart-5/30 text-foreground', ring);
}

function modelPrimary(model: string): string {
  const parts = model.split(' · ');
  return parts[parts.length - 1] ?? model;
}

function padTrack(number: number): string {
  return String(number).padStart(2, '0');
}
