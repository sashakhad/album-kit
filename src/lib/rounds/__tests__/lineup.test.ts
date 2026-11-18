import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/lib/settings/schema';
import {
  comparisonPreview,
  comparisonProblems,
  creditedModels,
  resolveLineup,
} from '@/lib/rounds/lineup';

const available = ['Opus', 'Soul', 'Grok', 'Sonnet', 'Fable', 'Haiku'];

describe('writer lineup', () => {
  it('offers five, swaps one, shrinks the lineup, and drops an unavailable writer', () => {
    expect(resolveLineup({ available }).lineup).toEqual([
      'Opus',
      'Soul',
      'Grok',
      'Sonnet',
      'Fable',
    ]);
    expect(
      resolveLineup({
        available,
        requested: ['Opus', 'Soul', 'Grok', 'Sonnet', 'Fable'],
        swap: { from: 'Fable', to: 'Haiku' },
      }).lineup
    ).toEqual(['Opus', 'Soul', 'Grok', 'Sonnet', 'Haiku']);
    expect(resolveLineup({ available, requested: ['Opus', 'Sonnet'] }).lineup).toEqual([
      'Opus',
      'Sonnet',
    ]);
    const missing = resolveLineup({
      available,
      requested: ['Opus', 'Retired Model'],
    });
    expect(missing.lineup).toEqual(['Opus']);
    expect(missing.unavailable).toEqual(['Retired Model']);
  });

  it('credits only models that ran and previews six or twelve takes', () => {
    expect(
      creditedModels([
        {
          writerHost: 'cursor',
          writerProvider: 'Anthropic',
          observedModel: 'Opus',
          executionId: 'run-1',
        },
        { writerHost: 'cursor', observedModel: null, executionId: null, writerProvider: null },
      ])
    ).toEqual(['Opus']);
    expect(comparisonPreview({ writers: 5, outputsPerGeneration: 2 })).toEqual({
      prompts: 6,
      takes: 12,
    });
    expect(comparisonPreview({ writers: 2, outputsPerGeneration: 2 })).toEqual({
      prompts: 3,
      takes: 6,
    });
  });

  it('rejects a combined prompt that names a writer with no run', () => {
    const problems = comparisonProblems(
      {
        ...DEFAULT_SETTINGS,
        comparison: 'originals-plus-combined',
        writerLineup: ['Opus'],
      },
      [
        {
          trackNumber: 1,
          role: 'original',
          writerHost: 'cursor',
          requestedModel: 'Opus',
          observedModel: 'Opus',
          writerProvider: 'Anthropic',
          executionId: 'run-1',
          lyrics: '[Instrumental]',
          brief: 'Haunted dance',
        },
        {
          trackNumber: 1,
          role: 'combined',
          writerHost: 'grok-bot',
          contributors: ['Sonnet'],
          lyrics: 'different lyric',
          brief: 'Haunted dance',
        },
      ]
    );
    expect(problems.join(' ')).toContain('no verified run');
    expect(problems.join(' ')).toContain('same brief and lyrics');
  });
});
