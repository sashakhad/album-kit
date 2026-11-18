import type { AlbumSettingsValue } from '@/lib/settings/schema';

export type LineupPrompt = {
  trackNumber: number;
  role?: 'original' | 'combined' | undefined;
  lyrics?: string | undefined;
  brief?: string | undefined;
  writerHost: 'grok-bot' | 'cursor';
  writerProvider?: string | null | undefined;
  requestedModel?: string | null | undefined;
  observedModel?: string | null | undefined;
  executionId?: string | null | undefined;
  contributors?: readonly string[] | undefined;
};

export function promptsPerTrack(settings: AlbumSettingsValue): number {
  if (settings.comparison === 'originals-plus-combined' && settings.writerLineup.length > 0) {
    return settings.writerLineup.length + 1;
  }
  return settings.promptVariations;
}

export function comparisonPreview(args: {
  writers: number;
  outputsPerGeneration: number;
  generationsPerPrompt?: number;
  includeCombined?: boolean;
}): { prompts: number; takes: number } {
  const includeCombined = args.includeCombined ?? true;
  const generationsPerPrompt = args.generationsPerPrompt ?? 1;
  const prompts = args.writers + (includeCombined ? 1 : 0);
  return {
    prompts,
    takes: prompts * generationsPerPrompt * args.outputsPerGeneration,
  };
}

/** Keep available models, apply one swap, and name anything that cannot run. */
export function resolveLineup(args: {
  available: readonly string[];
  requested?: readonly string[];
  swap?: { from: string; to: string };
  limit?: number;
}): { lineup: string[]; unavailable: string[] } {
  const limit = args.limit ?? 5;
  const source = args.requested ?? args.available;
  const lineup: string[] = [];
  const unavailable: string[] = [];
  const seen = new Set<string>();
  for (const name of source) {
    const chosen = args.swap !== undefined && name === args.swap.from ? args.swap.to : name;
    if (seen.has(chosen)) continue;
    seen.add(chosen);
    if (!args.available.includes(chosen)) {
      unavailable.push(chosen);
      continue;
    }
    if (lineup.length < limit) lineup.push(chosen);
  }
  return { lineup, unavailable };
}

/** A requested name with no execution record is not credited. */
export function creditedModels(
  prompts: readonly Pick<
    LineupPrompt,
    'writerHost' | 'writerProvider' | 'observedModel' | 'executionId'
  >[]
): string[] {
  const credited: string[] = [];
  for (const prompt of prompts) {
    if (prompt.writerHost !== 'cursor') continue;
    if (
      prompt.writerProvider === null ||
      prompt.writerProvider === undefined ||
      prompt.writerProvider.length === 0 ||
      prompt.observedModel === null ||
      prompt.observedModel === undefined ||
      prompt.observedModel.length === 0 ||
      prompt.executionId === null ||
      prompt.executionId === undefined ||
      prompt.executionId.length === 0
    ) {
      continue;
    }
    if (!credited.includes(prompt.observedModel)) credited.push(prompt.observedModel);
  }
  return credited;
}

function promptsForTrack(prompts: readonly LineupPrompt[], trackNumber: number): LineupPrompt[] {
  const rows: LineupPrompt[] = [];
  for (const prompt of prompts) {
    if (prompt.trackNumber === trackNumber) rows.push(prompt);
  }
  return rows;
}

function sameOptionalText(rows: readonly LineupPrompt[], field: 'lyrics' | 'brief'): boolean {
  let expected: string | undefined;
  let seen = false;
  for (const row of rows) {
    const value = row[field];
    if (!seen) {
      expected = value;
      seen = true;
      continue;
    }
    if (value !== expected) return false;
  }
  return true;
}

export function comparisonProblems(
  settings: AlbumSettingsValue,
  prompts: readonly LineupPrompt[]
): string[] {
  if (settings.comparison !== 'originals-plus-combined') return [];
  const problems: string[] = [];
  if (settings.writerLineup.length === 0) {
    problems.push('Choose at least one writer before a comparison.');
    return problems;
  }
  const tracks: number[] = [];
  for (const prompt of prompts) {
    if (!tracks.includes(prompt.trackNumber)) tracks.push(prompt.trackNumber);
  }
  for (const trackNumber of tracks) {
    const rows = promptsForTrack(prompts, trackNumber);
    const originals: LineupPrompt[] = [];
    const combined: LineupPrompt[] = [];
    for (const row of rows) {
      if (row.role === 'combined') combined.push(row);
      else if (row.role === 'original') originals.push(row);
      else problems.push(`Track ${trackNumber} has a prompt without an original or combined role.`);
    }
    if (originals.length !== settings.writerLineup.length) {
      problems.push(
        `Track ${trackNumber} needs one original prompt for each of the ${settings.writerLineup.length} writers.`
      );
    }
    if (combined.length !== 1) {
      problems.push(`Track ${trackNumber} needs one Combined prompt.`);
    }
    if (!sameOptionalText(rows, 'lyrics') || !sameOptionalText(rows, 'brief')) {
      problems.push(`Track ${trackNumber} must use the same brief and lyrics on every entry.`);
    }
    const ran = creditedModels(originals);
    for (const name of settings.writerLineup) {
      const matches: LineupPrompt[] = [];
      for (const row of originals) {
        if (row.requestedModel === name) matches.push(row);
      }
      if (matches.length !== 1) {
        problems.push(`Track ${trackNumber} needs exactly one original requested from ${name}.`);
        continue;
      }
      const row = matches[0];
      if (row === undefined || !ran.includes(row.observedModel ?? '')) {
        problems.push(`${name} has not run, so it is not credited on track ${trackNumber}.`);
      }
    }
    const entry = combined[0];
    if (entry !== undefined) {
      const contributors = entry.contributors ?? [];
      if (contributors.length === 0) {
        problems.push(
          `Combined on track ${trackNumber} must credit the writers whose ideas it used.`
        );
      }
      for (const name of contributors) {
        if (!ran.includes(name)) {
          problems.push(
            `Combined on track ${trackNumber} credits ${name}, which has no verified run.`
          );
        }
      }
    }
  }
  return problems;
}
