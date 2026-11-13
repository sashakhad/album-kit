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
