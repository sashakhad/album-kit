'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type YAxisTickContentProps,
} from 'recharts';

import {
  formatAverageScore,
  formatNumber,
  formatNumberExact,
  formatPercent,
} from '@/lib/formatters';
import type { ModelChartRow } from '@/lib/votes/model-stats';

const LIKES = 'var(--chart-2)';
const SCORE = 'var(--chart-3)';
const CUTS = 'var(--chart-5)';
const PICKS = 'var(--chart-1)';

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11, fontFamily: 'inherit' } as const;

export function LikesScoreChart({ rows }: { rows: ModelChartRow[] }) {
  function renderTooltip({ active, label }: TooltipContentProps) {
    if (active !== true || typeof label !== 'string') {
      return null;
    }
    const row = rows.find(function match(item) {
      return item.model === label;
    });
    if (row === undefined) {
      return null;
    }
    const average = row.averageScore === null ? '—' : formatAverageScore(row.averageScore);
    return (
      <div className='bg-popover text-popover-foreground rounded-lg border border-white/10 px-2.5 py-2 text-xs shadow-md'>
        <p className='mb-1 font-medium'>{row.model}</p>
        <p>
          Likes {formatNumberExact(row.liked)} of {formatNumberExact(row.active)} active
        </p>
        <p>Average {average}</p>
      </div>
    );
  }

  return (
    <div
      className='w-full min-w-0'
      style={{ height: chartHeight(rows.length, 52) }}
      aria-hidden='true'
    >
      <ResponsiveContainer
        width='100%'
        height='100%'
        initialDimension={{ width: 360, height: chartHeight(rows.length, 52) }}
      >
        <BarChart
          layout='vertical'
          data={rows}
          margin={{ top: 16, right: 48, bottom: 0, left: 0 }}
          barCategoryGap={12}
          barGap={3}
          accessibilityLayer={false}
        >
          <CartesianGrid horizontal={false} stroke='var(--border)' />
          <YAxis
            type='category'
            dataKey='model'
            width={156}
            interval={0}
            axisLine={false}
            tickLine={false}
            tick={ModelAxisTick}
          />
          <XAxis
            xAxisId='likes'
            type='number'
            orientation='bottom'
            domain={[0, 'auto']}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ ...AXIS_TICK, fill: LIKES, fontSize: 10 }}
            tickFormatter={formatCountTick}
          />
          <XAxis
            xAxisId='score'
            type='number'
            orientation='top'
            domain={scoreDomain}
            axisLine={false}
            tickLine={false}
            tick={{ ...AXIS_TICK, fill: SCORE, fontSize: 10 }}
            tickFormatter={formatScoreTick}
          />
          <Tooltip
            content={renderTooltip}
            cursor={{ fill: 'var(--foreground)', fillOpacity: 0.06 }}
            wrapperStyle={{ zIndex: 20, outline: 'none' }}
          />
          <Bar
            xAxisId='likes'
            dataKey='liked'
            name='Likes'
            fill={LIKES}
            radius={3}
            barSize={9}
            isAnimationActive={false}
          >
            <LabelList
              dataKey='liked'
              position='right'
              offset={6}
              fill='var(--foreground)'
              fontSize={11}
              formatter={formatCountLabel}
            />
          </Bar>
          <Bar
            xAxisId='score'
            dataKey='averageScore'
            name='Avg score'
            fill={SCORE}
            radius={3}
            barSize={9}
            isAnimationActive={false}
          >
            <LabelList
              dataKey='averageScore'
              position='right'
              offset={6}
              fill='var(--foreground)'
              fontSize={11}
              formatter={formatScoreLabel}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CutRateChart({ rows }: { rows: ModelChartRow[] }) {
  return (
    <MetricChart
      rows={rows}
      dataKey='cutRate'
      fill={CUTS}
      domain={[0, 1]}
      formatTick={formatRateTick}
      formatLabel={formatRateLabel}
      formatTooltip={function formatCutTooltip(row) {
        return `${formatNumberExact(row.cuts)} of ${formatNumberExact(row.takes)} removed`;
      }}
    />
  );
}

export function PicksChart({ rows }: { rows: ModelChartRow[] }) {
  return (
    <MetricChart
      rows={rows}
      dataKey='picks'
      fill={PICKS}
      domain={picksDomain(rows)}
      allowDecimals={false}
      formatTick={formatCountTick}
      formatLabel={formatCountLabel}
      formatTooltip={function formatPickTooltip(row) {
        return `${formatNumberExact(row.picks)} of ${formatNumberExact(row.takes)} takes`;
      }}
    />
  );
}

function MetricChart({
  rows,
  dataKey,
  fill,
  domain,
  allowDecimals = true,
  formatTick,
  formatLabel,
  formatTooltip,
}: {
  rows: ModelChartRow[];
  dataKey: 'cutRate' | 'picks';
  fill: string;
  domain: [number, number] | [number, 'auto'];
  allowDecimals?: boolean;
  formatTick: (value: number) => string;
  formatLabel: (label: unknown) => string;
  formatTooltip: (row: ModelChartRow) => string;
}) {
  function renderTooltip({ active, label }: TooltipContentProps) {
    if (active !== true || typeof label !== 'string') {
      return null;
    }
    const row = rows.find(function match(item) {
      return item.model === label;
    });
    if (row === undefined) {
      return null;
    }
    return (
      <div className='bg-popover text-popover-foreground rounded-lg border border-white/10 px-2.5 py-2 text-xs shadow-md'>
        <p className='mb-1 font-medium'>{row.model}</p>
        <p>{formatTooltip(row)}</p>
      </div>
    );
  }

  return (
    <div
      className='w-full min-w-0'
      style={{ height: chartHeight(rows.length, 40) }}
      aria-hidden='true'
    >
      <ResponsiveContainer
        width='100%'
        height='100%'
        initialDimension={{ width: 320, height: chartHeight(rows.length, 40) }}
      >
        <BarChart
          layout='vertical'
          data={rows}
          margin={{ top: 4, right: 48, bottom: 0, left: 0 }}
          barCategoryGap={10}
          accessibilityLayer={false}
        >
          <CartesianGrid horizontal={false} stroke='var(--border)' />
          <YAxis
            type='category'
            dataKey='model'
            width={156}
            interval={0}
            axisLine={false}
            tickLine={false}
            tick={ModelAxisTick}
          />
          <XAxis
            type='number'
            domain={domain}
            allowDecimals={allowDecimals}
            axisLine={false}
            tickLine={false}
            tick={{ ...AXIS_TICK, fontSize: 10 }}
            tickFormatter={formatTick}
            tickCount={dataKey === 'cutRate' ? 3 : 4}
          />
          <Tooltip
            content={renderTooltip}
            cursor={{ fill: 'var(--foreground)', fillOpacity: 0.06 }}
            wrapperStyle={{ zIndex: 20, outline: 'none' }}
          />
          <Bar dataKey={dataKey} fill={fill} radius={3} barSize={10} isAnimationActive={false}>
            <LabelList
              dataKey={dataKey}
              position='right'
              offset={6}
              fill='var(--foreground)'
              fontSize={11}
              formatter={formatLabel}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ModelAxisTick({ x, y, payload }: YAxisTickContentProps) {
  const raw: unknown = payload.value;
  const label = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
  const shown = label.length > 26 ? `${label.slice(0, 25)}…` : label;
  return (
    <g transform={`translate(${asNumber(x)},${asNumber(y)})`}>
      <title>{label}</title>
      <text
        dy={4}
        textAnchor='end'
        fill='var(--muted-foreground)'
        fontSize={11}
        fontFamily='inherit'
      >
        {shown}
      </text>
    </g>
  );
}

function chartHeight(count: number, perRow: number): number {
  return Math.max(148, count * perRow + 28);
}

function picksDomain(rows: readonly ModelChartRow[]): [number, number] {
  let max = 1;
  for (const row of rows) {
    if (row.picks > max) {
      max = row.picks;
    }
  }
  return [0, max];
}

function scoreDomain([dataMin, dataMax]: readonly [number, number]): [number, number] {
  return [Math.min(0, dataMin), Math.max(0, dataMax)];
}

function formatCountTick(value: number): string {
  return formatNumber(value);
}

function formatScoreTick(value: number): string {
  return formatAverageScore(value);
}

function formatRateTick(value: number): string {
  return formatPercent(value);
}

function formatCountLabel(label: unknown): string {
  return typeof label === 'number' ? formatNumber(label) : '';
}

function formatScoreLabel(label: unknown): string {
  return typeof label === 'number' ? formatAverageScore(label) : '';
}

function formatRateLabel(label: unknown): string {
  return typeof label === 'number' ? formatPercent(label) : '';
}

function asNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}
