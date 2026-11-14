export type ModelTake = {
  filename: string;
  trackNumber: number;
  trackTitle: string;
  model: string;
  score: number | null;
  picked: boolean;
  cut: boolean;
  parked: boolean;
};

export type ModelSummary = {
  model: string;
  takes: number;
  active: number;
  liked: number;
  score: number;
  cuts: number;
  picks: number;
};

export type ModelChartRow = ModelSummary & {
  averageScore: number | null;
  cutRate: number;
  pickRate: number;
};

export type AlbumHeadline = {
  takes: number;
  active: number;
  liked: number;
  cuts: number;
  picks: number;
  models: number;
  averageScore: number | null;
  cutRate: number;
};

export type TrackModelCell = {
  trackNumber: number;
  trackTitle: string;
  model: string;
  takes: number;
  active: number;
  liked: number;
  cuts: number;
  picks: number;
  score: number;
  averageScore: number | null;
};

export function promptModelLabel(
  row:
    | {
        writerHost: string;
        writerProvider: string | null;
        observedModel: string | null;
        attribution: string;
      }
    | undefined
): string {
  if (row === undefined) return 'Unverified / missing';
  if (row.writerHost === 'grok-bot') return 'Grok Bot · undisclosed';
  const provider = row.writerProvider ?? 'Cursor';
  return row.attribution === 'verified' && row.observedModel
    ? `${provider} · ${row.observedModel}`
    : `${provider} · unverified`;
}

export function summarizeModels(takes: readonly ModelTake[]): ModelSummary[] {
  const groups = new Map<string, ModelSummary>();
  for (const take of takes) {
    const row = groups.get(take.model) ?? {
      model: take.model,
      takes: 0,
      active: 0,
      liked: 0,
      score: 0,
      cuts: 0,
      picks: 0,
    };
    row.takes += 1;
    if (take.score !== null) {
      row.active += 1;
      row.score += take.score;
      if (take.score > 0) row.liked += 1;
    }
    if (take.cut) row.cuts += 1;
    if (take.picked) row.picks += 1;
    groups.set(take.model, row);
  }
  return [...groups.values()].sort(
    (a, b) => b.liked - a.liked || b.score - a.score || a.model.localeCompare(b.model)
  );
}

export function chartRows(takes: readonly ModelTake[]): ModelChartRow[] {
  return summarizeModels(takes).map(toChartRow);
}

export function albumHeadline(takes: readonly ModelTake[]): AlbumHeadline {
  let active = 0;
  let liked = 0;
  let cuts = 0;
  let picks = 0;
  let score = 0;
  const models = new Set<string>();
  for (const take of takes) {
    models.add(take.model);
    if (take.score !== null) {
      active += 1;
      score += take.score;
      if (take.score > 0) {
        liked += 1;
      }
    }
    if (take.cut) {
      cuts += 1;
    }
    if (take.picked) {
      picks += 1;
    }
  }
  return {
    takes: takes.length,
    active,
    liked,
    cuts,
    picks,
    models: models.size,
    averageScore: active === 0 ? null : score / active,
    cutRate: takes.length === 0 ? 0 : cuts / takes.length,
  };
}

export function trackModelCells(takes: readonly ModelTake[]): TrackModelCell[] {
  const groups = new Map<string, TrackModelCell>();
  for (const take of takes) {
    const key = `${take.trackNumber}\u0000${take.model}`;
    const cell = groups.get(key) ?? {
      trackNumber: take.trackNumber,
      trackTitle: take.trackTitle,
      model: take.model,
      takes: 0,
      active: 0,
      liked: 0,
      cuts: 0,
      picks: 0,
      score: 0,
      averageScore: null,
    };
    cell.takes += 1;
    if (take.score !== null) {
      cell.active += 1;
      cell.score += take.score;
      if (take.score > 0) {
        cell.liked += 1;
      }
    }
    if (take.cut) {
      cell.cuts += 1;
    }
    if (take.picked) {
      cell.picks += 1;
    }
    groups.set(key, cell);
  }
  const cells: TrackModelCell[] = [];
  for (const cell of groups.values()) {
    cell.averageScore = cell.active === 0 ? null : cell.score / cell.active;
    cells.push(cell);
  }
  cells.sort((a, b) => a.trackNumber - b.trackNumber || a.model.localeCompare(b.model));
  return cells;
}

function toChartRow(row: ModelSummary): ModelChartRow {
  return {
    ...row,
    averageScore: row.active === 0 ? null : row.score / row.active,
    cutRate: row.takes === 0 ? 0 : row.cuts / row.takes,
    pickRate: row.takes === 0 ? 0 : row.picks / row.takes,
  };
}
