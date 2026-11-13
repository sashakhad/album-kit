import { describe, expect, it } from 'vitest';

import { promptModelLabel, summarizeModels } from '@/lib/votes/model-stats';

describe('model stats', () => {
  it('uses observed verified model and keeps missing attribution separate', () => {
    expect(promptModelLabel(undefined)).toBe('Unverified / missing');
    expect(
      promptModelLabel({
        writerHost: 'cursor',
        writerProvider: 'OpenAI',
        observedModel: 'gpt-5',
        attribution: 'verified',
      })
    ).toBe('OpenAI · gpt-5');
    expect(
      promptModelLabel({
        writerHost: 'cursor',
        writerProvider: 'OpenAI',
        observedModel: 'gpt-5',
        attribution: 'unverified',
      })
    ).toBe('OpenAI · unverified');
  });

  it('counts current positive takes separately from cuts and picks', () => {
    const stats = summarizeModels([
      {
        filename: 'a',
        trackNumber: 1,
        trackTitle: 'One',
        model: 'A',
        score: 2,
        picked: true,
        cut: false,
        parked: false,
      },
      {
        filename: 'b',
        trackNumber: 1,
        trackTitle: 'One',
        model: 'A',
        score: null,
        picked: false,
        cut: true,
        parked: false,
      },
      {
        filename: 'c',
        trackNumber: 2,
        trackTitle: 'Two',
        model: 'B',
        score: 0,
        picked: false,
        cut: false,
        parked: false,
      },
    ]);
    expect(stats[0]).toMatchObject({
      model: 'A',
      takes: 2,
      active: 1,
      liked: 1,
      score: 2,
      cuts: 1,
      picks: 1,
    });
    expect(stats[1]).toMatchObject({
      model: 'B',
      takes: 1,
      active: 1,
      liked: 0,
      score: 0,
      cuts: 0,
      picks: 0,
    });
  });
});
