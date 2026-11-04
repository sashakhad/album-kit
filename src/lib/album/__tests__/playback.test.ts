import { describe, expect, it } from 'vitest';

import {
  audioUrlForTrack,
  collectPlayableIndexes,
  collectTakeLabels,
  isOnAlbumShortlist,
  nextPlayableIndex,
  nextVariation,
  previousPlayableIndex,
  previousVariation,
  takeForTrack,
} from '@/lib/album/playback';
import type { AlbumTrack } from '@/lib/album/types';

const tracks: AlbumTrack[] = [
  {
    number: 1,
    title: 'One',
    kind: 'album',
    filename: '01-one.mp3',
    audioUrl: '/one-a.mp3',
    takes: [
      {
        label: 'A',
        filename: '01-one.mp3',
        audioUrl: '/one-a.mp3',
        versionSlug: 'v1',
        voteLabel: 'A',
      },
      {
        label: 'B',
        filename: '01-one-takeb.mp3',
        audioUrl: '/one-b.mp3',
        versionSlug: 'v1',
        voteLabel: 'B',
      },
    ],
    prompt: null,
  },
  {
    number: 2,
    title: 'Two',
    kind: 'album',
    filename: null,
    audioUrl: null,
    takes: [],
    prompt: null,
  },
  {
    number: 3,
    title: 'Three',
    kind: 'album',
    filename: '03-three.mp3',
    audioUrl: '/three-a.mp3',
    takes: [
      {
        label: 'A',
        filename: '03-three.mp3',
        audioUrl: '/three-a.mp3',
        versionSlug: 'v1',
        voteLabel: 'A',
      },
      {
        label: 'B',
        filename: '03-three-takeb.mp3',
        audioUrl: '/three-b.mp3',
        versionSlug: 'v1',
        voteLabel: 'B',
      },
    ],
    prompt: null,
  },
];

describe('playback', () => {
  it('skips tracks with no audio', () => {
    expect(collectPlayableIndexes(tracks)).toEqual([0, 2]);
  });

  it('advances to the next playable track and stops at the end', () => {
    expect(nextPlayableIndex([0, 2], 0, false)).toBe(2);
    expect(nextPlayableIndex([0, 2], 2, false)).toBeNull();
    expect(nextPlayableIndex([0, 2], 2, true)).toBe(0);
  });

  it('steps back to the previous playable track and wraps to the last', () => {
    expect(previousPlayableIndex([0, 2], 2)).toBe(0);
    expect(previousPlayableIndex([0, 2], 0)).toBe(2);
  });

  it('uses the album take when a track has it', () => {
    const three = tracks[2];
    if (three === undefined) {
      throw new Error('expected track 3');
    }

    expect(takeForTrack(three, {}, 'B')?.label).toBe('B');
    expect(audioUrlForTrack(three, {}, 'B')).toBe('/three-b.mp3');
  });

  it('hides a fully parked track from the album shortlist', () => {
    const waiting = tracks[1];
    const one = tracks[0];
    if (waiting === undefined || one === undefined) {
      throw new Error('expected tracks');
    }

    expect(isOnAlbumShortlist(waiting)).toBe(true);
    expect(isOnAlbumShortlist(one)).toBe(true);
    expect(
      isOnAlbumShortlist({
        ...waiting,
        parkedTakes: [
          {
            label: 'Bubu A',
            filename: '02-two-takea.mp3',
            audioUrl: '/two-a.mp3',
            versionSlug: 'v1',
            voteLabel: 'A',
          },
        ],
      })
    ).toBe(false);
  });

  it('can play a parked take without putting it on the shortlist', () => {
    const one = tracks[0];
    if (one === undefined) {
      throw new Error('expected track 1');
    }
    const withParked: AlbumTrack = {
      ...one,
      parkedTakes: [
        {
          label: 'Bubu D',
          filename: '01-one-taked.mp3',
          audioUrl: '/one-d.mp3',
          versionSlug: 'v1',
          voteLabel: 'D',
        },
      ],
    };

    expect(takeForTrack(withParked, {}, 'A')?.label).toBe('A');
    expect(takeForTrack(withParked, { 'album-1': 'Bubu D' }, 'A')?.audioUrl).toBe('/one-d.mp3');
    expect(withParked.takes.map(take => take.label)).toEqual(['A', 'B']);
  });

  it('keeps a per-track take over the album take', () => {
    const one = tracks[0];
    if (one === undefined) {
      throw new Error('expected track 1');
    }

    expect(takeForTrack(one, { 'album-1': 'A' }, 'B')?.label).toBe('A');
  });

  it('lists take labels in album order', () => {
    expect(collectTakeLabels(tracks)).toEqual(['A', 'B']);
  });

  it('advances through variations and stops after the last one', () => {
    const one = tracks[0];
    if (one === undefined) {
      throw new Error('expected track 1');
    }

    expect(nextVariation(one.takes, one.takes[0] ?? null, false)?.label).toBe('B');
    expect(nextVariation(one.takes, one.takes[1] ?? null, false)).toBeNull();
    expect(nextVariation(one.takes, one.takes[1] ?? null, true)?.label).toBe('A');
  });

  it('moves backward through variations and wraps to the last one', () => {
    const one = tracks[0];
    if (one === undefined) {
      throw new Error('expected track 1');
    }

    expect(previousVariation(one.takes, one.takes[1] ?? null)?.label).toBe('A');
    expect(previousVariation(one.takes, one.takes[0] ?? null)?.label).toBe('B');
  });
});
