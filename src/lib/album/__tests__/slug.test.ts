import { describe, expect, it } from 'vitest';

import { slugifyTrackTitle } from '../slug';

describe('slugifyTrackTitle', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slugifyTrackTitle('Track One')).toBe('track-one');
    expect(slugifyTrackTitle('BigRoomStomp')).toBe('bigroomstomp');
    expect(slugifyTrackTitle('B1g R00m')).toBe('b1g-r00m');
  });

  it('drops apostrophes instead of splitting on them', () => {
    expect(slugifyTrackTitle("D0n't St0p")).toBe('d0nt-st0p');
    expect(slugifyTrackTitle('Rock’n Roll')).toBe('rockn-roll');
  });

  it('turns punctuation, underscores and other scripts into single dashes', () => {
    expect(slugifyTrackTitle('wh!stle 1t')).toBe('wh-stle-1t');
    expect(slugifyTrackTitle('under_score')).toBe('under-score');
    expect(slugifyTrackTitle('LOUD//BUT//KIND')).toBe('loud-but-kind');
    expect(slugifyTrackTitle('BΛD_IDEA')).toBe('b-d-idea');
    expect(slugifyTrackTitle('nØ way')).toBe('n-way');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugifyTrackTitle('  (Track One) ')).toBe('track-one');
    expect(slugifyTrackTitle('Track One (VIP)')).toBe('track-one-vip');
    expect(slugifyTrackTitle('Track One (h4rd mod3)')).toBe('track-one-h4rd-mod3');
  });
});
