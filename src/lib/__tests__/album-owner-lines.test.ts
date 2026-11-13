import { describe, expect, it } from 'vitest';

import {
  formatChatLines,
  formatProgressReport,
  progressLineFrom,
  PROGRESS_UNREAD,
} from '../../../scripts/album-owner.mjs';

describe('owner chat lines', () => {
  it('prints the site and the owner link without the album key', () => {
    const siteUrl = 'https://album.example';
    const ownerLink = 'https://album.example/key?next=%2Fvote#owner=abc';
    const text = formatChatLines({
      siteUrl,
      progressLine: 'Round 1: 36/90 done, 72 of 180 takes ready.',
      ownerLink,
    });

    expect(text).toBe(
      `Round 1: 36/90 done, 72 of 180 takes ready.\nSite: ${siteUrl}\nOwner: ${ownerLink}\nWorks once. Valid for 7 days. This browser stays signed in after you continue.\n`
    );
    expect(text).not.toContain('album-key');
    expect(text).not.toContain('ALBUM_KEY');
  });

  it('can print the site alone', () => {
    expect(formatChatLines({ siteUrl: 'https://album.example' })).toBe(
      'Site: https://album.example\n'
    );
  });

  it('prints a count when the site omits the progress line', () => {
    expect(
      progressLineFrom({
        roundNumber: 1,
        jobsFinished: 4,
        jobsExpected: 90,
        takesReady: 8,
        takesExpected: 180,
      })
    ).toBe('Round 1: 4/90 done, 8 of 180 takes ready.');
    expect(progressLineFrom({})).toBe(PROGRESS_UNREAD);
  });

  it('prints a live track link without the album key', () => {
    const text = formatProgressReport({
      siteUrl: 'https://album.example',
      progress: {
        line: 'Round 1: 1/90 done, 2 of 180 takes ready.',
        liveTracks: [{ trackNumber: 1, title: 'First', path: '/vote/first' }],
      },
    });
    expect(text).toContain('Track 1 First: https://album.example/vote/first');
    expect(text).not.toContain('album-key');
  });
});
