import { describe, expect, it } from 'vitest';

import { styleProblems } from '../prompt-quality';

describe('Style quality gate', () => {
  it('keeps the title and humor framing out of the producer brief', () => {
    expect(styleProblems('A Plant Bassd title pun in a club track.', "Plant Bass'd")).toContain(
      'The track title belongs in the Title field, not Style'
    );
    expect(styleProblems('Funny but serious house music.', 'Any Track')).toContain(
      'Keep the title joke and humor framing out of Style'
    );
  });

  it('allows a serious musical direction without treating an ordinary short title as forbidden genre text', () => {
    expect(
      styleProblems(
        'Driving house with dry drums, a warm bass hook, and a late breakdown.',
        'House'
      )
    ).toEqual([]);
  });
});
