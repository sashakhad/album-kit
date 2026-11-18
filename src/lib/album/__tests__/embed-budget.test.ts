import { describe, expect, it } from 'vitest';

import {
  BITRATE_CEILING_KBPS,
  BITRATE_FLOOR_KBPS,
  PAGE_BYTE_BUDGET,
  REVIEW_BITRATES_KBPS,
  albumPageName,
  base64Length,
  estimatedPageBytes,
  lowerReviewBitrate,
  packPagesBySize,
  pageFitsBudget,
  reviewBitrateKbps,
  type BudgetTake,
} from '@/lib/album/embed-budget';
import {
  REVIEW_BITRATE_CEILING_KBPS,
  REVIEW_BITRATE_FLOOR_KBPS,
} from '@/lib/album/embed-public-audio';

const shellBytes = 512_507;

function durations(count: number, seconds: number): number[] {
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) values.push(seconds);
  return values;
}

function take(id: string, trackNumber: number, order: number, pageBytes: number): BudgetTake {
  return { id, trackNumber, order, pageBytes };
}

describe('review bitrate budget', () => {
  it('uses the ceiling for a six-take album and steps down when twelve takes do not fit', () => {
    const six = durations(6, 184);
    expect(reviewBitrateKbps({ durationsSeconds: six, shellBytes })).toBe(BITRATE_CEILING_KBPS);
    expect(
      pageFitsBudget({
        durationsSeconds: six,
        bitrateKbps: BITRATE_CEILING_KBPS,
        shellBytes,
      })
    ).toBe(true);

    const twelve = durations(12, 184);
    const bitrate = reviewBitrateKbps({ durationsSeconds: twelve, shellBytes });
    expect(bitrate).toBe(56);
    expect(bitrate).toBeGreaterThanOrEqual(BITRATE_FLOOR_KBPS);
    expect(bitrate).toBeLessThanOrEqual(BITRATE_CEILING_KBPS);
    expect(pageFitsBudget({ durationsSeconds: twelve, bitrateKbps: bitrate, shellBytes })).toBe(
      true
    );
    expect(pageFitsBudget({ durationsSeconds: twelve, bitrateKbps: bitrate + 8, shellBytes })).toBe(
      false
    );
    expect(
      estimatedPageBytes({ durationsSeconds: twelve, bitrateKbps: bitrate, shellBytes })
    ).toBeLessThanOrEqual(PAGE_BYTE_BUDGET);
  });

  it('picks a lower step as the total duration grows, and stops at the floor', () => {
    const shorter = reviewBitrateKbps({ durationsSeconds: durations(4, 120), shellBytes });
    const longer = reviewBitrateKbps({ durationsSeconds: durations(12, 220), shellBytes });
    expect(shorter).toBeGreaterThanOrEqual(longer);
    const enormous = durations(40, 600);
    expect(reviewBitrateKbps({ durationsSeconds: enormous, shellBytes })).toBe(BITRATE_FLOOR_KBPS);
    expect(
      pageFitsBudget({
        durationsSeconds: enormous,
        bitrateKbps: BITRATE_FLOOR_KBPS,
        shellBytes,
      })
    ).toBe(false);
    expect(reviewBitrateKbps({ durationsSeconds: [], shellBytes })).toBe(BITRATE_CEILING_KBPS);
  });

  it('steps down by 8 kbps inside the review range', () => {
    expect(REVIEW_BITRATES_KBPS[0]).toBe(BITRATE_CEILING_KBPS);
    expect(REVIEW_BITRATES_KBPS[REVIEW_BITRATES_KBPS.length - 1]).toBe(BITRATE_FLOOR_KBPS);
    expect(REVIEW_BITRATE_CEILING_KBPS).toBe(BITRATE_CEILING_KBPS);
    expect(REVIEW_BITRATE_FLOOR_KBPS).toBe(BITRATE_FLOOR_KBPS);
    expect(lowerReviewBitrate(96)).toBe(88);
    expect(lowerReviewBitrate(48)).toBeNull();
    expect(base64Length(0)).toBe(0);
    expect(base64Length(1)).toBe(4);
    expect(base64Length(3)).toBe(4);
    expect(base64Length(4)).toBe(8);
  });

  it('names the first attachment Open Album.html and the rest in order', () => {
    expect(albumPageName(0)).toBe('Open Album.html');
    expect(albumPageName(1)).toBe('Open Album 2.html');
    expect(albumPageName(2)).toBe('Open Album 3.html');
    expect(() => albumPageName(-1)).toThrow(/index/);
  });
});

describe('page splitting', () => {
  it('keeps a track together and is independent of input order', () => {
    const takes = [
      take('t3', 3, 1, 40),
      take('t1b', 1, 2, 20),
      take('t2', 2, 1, 30),
      take('t1a', 1, 1, 20),
    ];
    const packed = packPagesBySize(takes, 10, 100);
    expect(packed).toEqual([['t1a', 't1b', 't2'], ['t3']]);
    expect(packPagesBySize([...takes].reverse(), 10, 100)).toEqual(packed);
  });

  it('splits one track when that track alone exceeds the budget', () => {
    const packed = packPagesBySize(
      [take('a', 1, 1, 60), take('b', 1, 2, 60), take('c', 2, 1, 20)],
      10,
      100
    );
    expect(packed).toEqual([['a'], ['b', 'c']]);
  });

  it('still emits a take that cannot fit on a page by itself', () => {
    expect(packPagesBySize([take('huge', 1, 1, 500)], 10, 100)).toEqual([['huge']]);
    expect(packPagesBySize([], 10, 100)).toEqual([[]]);
  });
});
