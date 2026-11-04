import { describe, expect, it } from 'vitest';

import type { CanonicalTrack } from '@/lib/album/build-version';
import type { AlbumTake, AlbumVersion } from '@/lib/album/types';

import {
  buildConsolidatedPassVersion,
  filterVersionForPass,
  isTakeVisibleInPass,
  votesToCarryForward,
} from '@/lib/votes/pass';

const TRACKLIST: CanonicalTrack[] = [
  { number: 1, title: 'Track One' },
  { number: 11, title: 'Track Eleven' },
  { number: 21, title: 'Track Twenty-One' },
  { number: 23, title: 'Track Twenty-Three' },
  { number: 24, title: 'Track Twenty-Four' },
  { number: 39, title: 'Track Thirty-Nine' },
  { number: 41, title: 'Track Forty-One' },
];

const bubu: AlbumVersion = {
  slug: 'v1',
  folder: 'v1',
  title: 'Bubu',
  author: 'Bubu',
  blurb: '',
  tracks: [
    {
      number: 1,
      title: 'Track One',
      kind: 'album',
      filename: 'v1-01-track-one-p1-takea.mp3',
      audioUrl: '/one-a.mp3',
      takes: [
        {
          label: 'A',
          filename: 'v1-01-track-one-p1-takea.mp3',
          audioUrl: '/one-a.mp3',
          versionSlug: 'v1',
          voteLabel: 'A',
        },
        {
          label: 'B',
          filename: 'v1-01-track-one-p1-takeb.mp3',
          audioUrl: '/one-b.mp3',
          versionSlug: 'v1',
          voteLabel: 'B',
        },
      ],
      prompt: null,
    },
    {
      number: 11,
      title: 'Track Eleven',
      kind: 'album',
      filename: 'v1-11-track-eleven-p1-takea.mp3',
      audioUrl: '/a.mp3',
      takes: [
        {
          label: 'A',
          filename: 'v1-11-track-eleven-p1-takea.mp3',
          audioUrl: '/a.mp3',
          versionSlug: 'v1',
          voteLabel: 'A',
        },
        {
          label: 'C',
          filename: 'v1-11-track-eleven-p2-takec.mp3',
          audioUrl: '/c.mp3',
          versionSlug: 'v1',
          voteLabel: 'C',
        },
      ],
      prompt: null,
    },
  ],
};

const lulu: AlbumVersion = {
  slug: 'v2',
  folder: 'v2',
  title: 'Lulu',
  author: 'Lulu',
  blurb: '',
  tracks: [
    {
      number: 1,
      title: 'Track One',
      kind: 'album',
      filename: 'v2-01-track-one-p1-takec.mp3',
      audioUrl: '/lulu-c.mp3',
      takes: [
        {
          label: 'C',
          filename: 'v2-01-track-one-p1-takec.mp3',
          audioUrl: '/lulu-c.mp3',
          versionSlug: 'v2',
          voteLabel: 'C',
        },
        {
          label: 'D',
          filename: 'v2-01-track-one-p1-taked.mp3',
          audioUrl: '/lulu-d.mp3',
          versionSlug: 'v2',
          voteLabel: 'D',
        },
      ],
      prompt: null,
    },
  ],
};

describe('isTakeVisibleInPass', () => {
  it('shows every take on pass 1', () => {
    expect(
      isTakeVisibleInPass({
        currentRound: 1,
        versionSlug: 'v1',
        trackNumber: 11,
        takeLabel: 'A',
        votes: [],
      })
    ).toBe(true);
  });

  it('keeps a take downvoted on the current pass', () => {
    expect(
      isTakeVisibleInPass({
        currentRound: 1,
        versionSlug: 'v1',
        trackNumber: 5,
        takeLabel: 'D',
        votes: [{ versionSlug: 'v1', trackNumber: 5, takeLabel: 'D', round: 1, value: -1 }],
      })
    ).toBe(true);
    expect(
      isTakeVisibleInPass({
        currentRound: 10,
        versionSlug: 'v1',
        trackNumber: 21,
        takeLabel: 'A',
        votes: [{ versionSlug: 'v1', trackNumber: 21, takeLabel: 'A', round: 10, value: -1 }],
      })
    ).toBe(true);
  });

  it('hides a take downvoted on an earlier pass', () => {
    expect(
      isTakeVisibleInPass({
        currentRound: 10,
        versionSlug: 'v1',
        trackNumber: 21,
        takeLabel: 'A',
        votes: [{ versionSlug: 'v1', trackNumber: 21, takeLabel: 'A', round: 9, value: -1 }],
      })
    ).toBe(false);
  });

  it('drops earlier downvotes and keeps zero-vote takes', () => {
    const votes = [
      { versionSlug: 'v1', trackNumber: 11, takeLabel: 'C', round: 1, value: 1 as const },
      { versionSlug: 'v1', trackNumber: 11, takeLabel: 'A', round: 1, value: -1 as const },
    ];
    expect(
      isTakeVisibleInPass({
        currentRound: 2,
        versionSlug: 'v1',
        trackNumber: 11,
        takeLabel: 'C',
        votes,
      })
    ).toBe(true);
    expect(
      isTakeVisibleInPass({
        currentRound: 2,
        versionSlug: 'v1',
        trackNumber: 11,
        takeLabel: 'A',
        votes,
      })
    ).toBe(false);
    expect(
      isTakeVisibleInPass({
        currentRound: 2,
        versionSlug: 'v1',
        trackNumber: 11,
        takeLabel: 'D',
        votes,
      })
    ).toBe(true);
  });

  it('keeps a pass-1 zero on later passes if it was never downvoted', () => {
    expect(
      isTakeVisibleInPass({
        currentRound: 3,
        versionSlug: 'v1',
        trackNumber: 11,
        takeLabel: 'D',
        votes: [
          { versionSlug: 'v1', trackNumber: 11, takeLabel: 'C', round: 1, value: 1 },
          { versionSlug: 'v1', trackNumber: 11, takeLabel: 'C', round: 2, value: 1 },
        ],
      })
    ).toBe(true);
  });

  it('keeps a prior downvote out even when a later pass never saw it', () => {
    expect(
      isTakeVisibleInPass({
        currentRound: 3,
        versionSlug: 'v1',
        trackNumber: 11,
        takeLabel: 'A',
        votes: [{ versionSlug: 'v1', trackNumber: 11, takeLabel: 'A', round: 1, value: -1 }],
      })
    ).toBe(false);
  });

  it('keeps a take downvoted on the current pass until the next one', () => {
    expect(
      isTakeVisibleInPass({
        currentRound: 9,
        versionSlug: 'v1',
        trackNumber: 10,
        takeLabel: 'A',
        votes: [{ versionSlug: 'v1', trackNumber: 10, takeLabel: 'A', round: 9, value: -1 }],
      })
    ).toBe(true);
  });

  it('drops a take that went negative on the last pass even if earlier passes were positive', () => {
    expect(
      isTakeVisibleInPass({
        currentRound: 3,
        versionSlug: 'v1',
        trackNumber: 11,
        takeLabel: 'C',
        votes: [
          { versionSlug: 'v1', trackNumber: 11, takeLabel: 'C', round: 1, value: 3 },
          { versionSlug: 'v1', trackNumber: 11, takeLabel: 'C', round: 2, value: -1 },
        ],
      })
    ).toBe(false);
  });

  it('drops a parked take on later passes without treating it as a downvote', () => {
    expect(
      isTakeVisibleInPass({
        currentRound: 9,
        versionSlug: 'v1',
        trackNumber: 14,
        takeLabel: 'D',
        votes: [{ versionSlug: 'v1', trackNumber: 14, takeLabel: 'D', round: 9, value: 1 }],
        parked: [{ versionSlug: 'v1', trackNumber: 14, takeLabel: 'D' }],
      })
    ).toBe(false);
    expect(
      isTakeVisibleInPass({
        currentRound: 9,
        versionSlug: 'v1',
        trackNumber: 14,
        takeLabel: 'K',
        votes: [{ versionSlug: 'v1', trackNumber: 14, takeLabel: 'K', round: 9, value: 2 }],
        parked: [{ versionSlug: 'v1', trackNumber: 14, takeLabel: 'D' }],
      })
    ).toBe(true);
  });
});

describe('votesToCarryForward', () => {
  it('copies last-pass positives onto the next pass and drops negatives', () => {
    expect(
      votesToCarryForward(
        [
          { versionSlug: 'v1', trackNumber: 5, takeLabel: 'D', round: 6, value: 1 },
          { versionSlug: 'v1', trackNumber: 5, takeLabel: 'B', round: 6, value: -1 },
          { versionSlug: 'v2', trackNumber: 1, takeLabel: 'C', round: 5, value: 4 },
          { versionSlug: 'v1', trackNumber: 14, takeLabel: 'M', round: 6, value: 3 },
        ],
        7
      )
    ).toEqual([
      { versionSlug: 'v1', trackNumber: 5, takeLabel: 'D', value: 1, round: 7 },
      { versionSlug: 'v2', trackNumber: 1, takeLabel: 'C', value: 4, round: 7 },
      { versionSlug: 'v1', trackNumber: 14, takeLabel: 'M', value: 3, round: 7 },
    ]);
  });
});

describe('filterVersionForPass', () => {
  it('drops earlier downvotes and keeps untouched takes', () => {
    const filtered = filterVersionForPass({
      version: bubu,
      currentRound: 2,
      votes: [
        { versionSlug: 'v1', trackNumber: 11, takeLabel: 'C', round: 1, value: 1 },
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', round: 1, value: -1 },
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'B', round: 1, value: 1 },
      ],
    });

    expect(filtered.tracks[0]?.takes.map(take => take.label)).toEqual(['B']);
    expect(filtered.tracks[1]?.takes.map(take => take.label)).toEqual(['A', 'C']);
  });

  it('keeps a current-pass downvote and an unvoted take', () => {
    const filtered = filterVersionForPass({
      version: bubu,
      currentRound: 1,
      votes: [{ versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', round: 1, value: -1 }],
    });

    expect(filtered.tracks[0]?.takes.map(take => take.label)).toEqual(['A', 'B']);
    expect(filtered.tracks[1]?.takes.map(take => take.label)).toEqual(['A', 'C']);
  });
});

describe('buildConsolidatedPassVersion', () => {
  it('puts surviving takes on one tracklist, including zeros', () => {
    const pass = buildConsolidatedPassVersion({
      versions: [bubu, lulu],
      currentRound: 2,
      votes: [
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'B', round: 1, value: 1 },
        { versionSlug: 'v2', trackNumber: 1, takeLabel: 'C', round: 1, value: 1 },
        { versionSlug: 'v2', trackNumber: 1, takeLabel: 'D', round: 1, value: -1 },
        { versionSlug: 'v1', trackNumber: 11, takeLabel: 'C', round: 1, value: 1 },
      ],
      tracklist: TRACKLIST,
    });

    expect(pass.slug).toBe('pass');
    expect(pass.title).toBe('Round 2');
    const one = pass.tracks.find(track => track.number === 1);
    expect(one?.takes.map(take => take.label)).toEqual(['Bubu A', 'Bubu B', 'Lulu C']);
    expect(one?.takes[0]?.versionSlug).toBe('v1');
    expect(one?.takes[0]?.voteLabel).toBe('A');
    const eleven = pass.tracks.find(track => track.number === 11);
    expect(eleven?.takes.map(take => take.label)).toEqual(['Bubu A', 'Bubu C']);
  });

  it('keeps title candidates on the pass with no takes', () => {
    const pass = buildConsolidatedPassVersion({
      versions: [bubu],
      currentRound: 1,
      votes: [],
      tracklist: TRACKLIST,
    });

    const thirtyNine = pass.tracks.find(track => track.number === 39);
    expect(thirtyNine?.title).toBe('Track Thirty-Nine');
    expect(thirtyNine?.takes).toEqual([]);
    expect(thirtyNine?.audioUrl).toBeNull();
    expect(pass.tracks.find(track => track.number === 41)?.title).toBe('Track Forty-One');
  });

  it('keeps a parked take off the shortlist and lists it for later', () => {
    const pass = buildConsolidatedPassVersion({
      versions: [bubu],
      currentRound: 9,
      votes: [
        { versionSlug: 'v1', trackNumber: 11, takeLabel: 'A', round: 9, value: 1 },
        { versionSlug: 'v1', trackNumber: 11, takeLabel: 'C', round: 9, value: 3 },
      ],
      parked: [{ versionSlug: 'v1', trackNumber: 11, takeLabel: 'A' }],
      tracklist: TRACKLIST,
    });

    const eleven = pass.tracks.find(track => track.number === 11);
    expect(eleven?.takes.map(take => take.label)).toEqual(['Bubu C']);
    expect(eleven?.parkedTakes?.map(take => take.label)).toEqual(['Bubu A']);
  });

  it('keeps a fully parked track for Possible renames', () => {
    const twentyOne: AlbumVersion = {
      ...bubu,
      tracks: [
        {
          number: 21,
          title: 'Track Twenty-One',
          kind: 'album',
          filename: 'v1-21-track-twenty-one-p1-takea.mp3',
          audioUrl: '/twenty-one-a.mp3',
          takes: [
            {
              label: 'A',
              filename: 'v1-21-track-twenty-one-p1-takea.mp3',
              audioUrl: '/twenty-one-a.mp3',
              versionSlug: 'v1',
              voteLabel: 'A',
            },
            {
              label: 'F',
              filename: 'v1-21-track-twenty-one-p3-takef.mp3',
              audioUrl: '/twenty-one-f.mp3',
              versionSlug: 'v1',
              voteLabel: 'F',
            },
          ],
          prompt: null,
        },
      ],
    };

    const pass = buildConsolidatedPassVersion({
      versions: [twentyOne],
      currentRound: 11,
      votes: [],
      parked: [
        { versionSlug: 'v1', trackNumber: 21, takeLabel: 'A' },
        { versionSlug: 'v1', trackNumber: 21, takeLabel: 'F' },
      ],
      tracklist: TRACKLIST,
    });

    const parked = pass.tracks.find(track => track.number === 21);
    expect(parked?.title).toBe('Track Twenty-One');
    expect(parked?.takes).toEqual([]);
    expect(parked?.audioUrl).toBeNull();
    expect(parked?.parkedTakes?.map(take => take.label)).toEqual(['Bubu A', 'Bubu F']);
  });
});

function oneTakes(versionSlug: string, letters: readonly string[]): AlbumTake[] {
  const takes: AlbumTake[] = [];
  for (const letter of letters) {
    takes.push({
      label: letter,
      filename: `v1-01-track-one-p1-take${letter.toLowerCase()}.mp3`,
      audioUrl: `/one-${letter.toLowerCase()}.mp3`,
      versionSlug,
      voteLabel: letter,
    });
  }
  return takes;
}

const oneLetters: AlbumVersion = {
  slug: 'v1',
  folder: 'v1',
  title: 'Bubu',
  author: 'Bubu',
  blurb: '',
  tracks: [
    {
      number: 1,
      title: 'Track One',
      kind: 'album',
      filename: 'v1-01-track-one-p1-takea.mp3',
      audioUrl: '/one-a.mp3',
      takes: oneTakes('v1', ['A', 'B', 'C', 'D', 'E', 'F']),
      prompt: null,
    },
    {
      number: 23,
      title: 'Track Twenty-Three',
      kind: 'album',
      filename: null,
      audioUrl: null,
      takes: [],
      prompt: null,
    },
    {
      number: 24,
      title: 'Old Twenty-Four',
      kind: 'album',
      filename: 'v1-24-track-twenty-four-p1-takea.mp3',
      audioUrl: '/twenty-four.mp3',
      takes: [
        {
          label: 'A',
          filename: 'v1-24-track-twenty-four-p1-takea.mp3',
          audioUrl: '/twenty-four.mp3',
          versionSlug: 'v1',
          voteLabel: 'A',
        },
      ],
      prompt: null,
    },
  ],
};

const twentyThreeLulu: AlbumVersion = {
  slug: 'v2',
  folder: 'v2',
  title: 'Lulu',
  author: 'Lulu',
  blurb: '',
  tracks: [
    {
      number: 23,
      title: 'Track Twenty-Three',
      kind: 'album',
      filename: 'v2-23-track-twenty-three-p1-takea.mp3',
      audioUrl: '/twenty-three.mp3',
      takes: [
        {
          label: 'A',
          filename: 'v2-23-track-twenty-three-p1-takea.mp3',
          audioUrl: '/twenty-three.mp3',
          versionSlug: 'v2',
          voteLabel: 'A',
        },
      ],
      prompt: null,
    },
  ],
};

describe('later pass keeps unvoted takes', () => {
  it('keeps a never-voted singleton on a later pass', () => {
    expect(
      isTakeVisibleInPass({
        currentRound: 10,
        versionSlug: 'v1',
        trackNumber: 24,
        takeLabel: 'A',
        votes: [{ versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', round: 9, value: 3 }],
      })
    ).toBe(true);

    const pass = buildConsolidatedPassVersion({
      versions: [oneLetters, twentyThreeLulu],
      currentRound: 10,
      votes: [{ versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', round: 9, value: 3 }],
      tracklist: TRACKLIST,
    });

    const twentyFour = pass.tracks.find(track => track.number === 24);
    expect(twentyFour?.title).toBe('Track Twenty-Four');
    expect(twentyFour?.takes.map(take => take.label)).toEqual(['Bubu A']);
  });

  it('keeps never-voted extra letters next to a voted letter', () => {
    const pass = buildConsolidatedPassVersion({
      versions: [oneLetters],
      currentRound: 9,
      votes: [{ versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', round: 8, value: 3 }],
      tracklist: TRACKLIST,
    });

    const one = pass.tracks.find(track => track.number === 1);
    expect(one?.takes.map(take => take.voteLabel)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('keeps a current-pass downvote and a never-voted singleton on a later pass', () => {
    const filtered = filterVersionForPass({
      version: oneLetters,
      currentRound: 10,
      votes: [{ versionSlug: 'v1', trackNumber: 1, takeLabel: 'D', round: 10, value: -1 }],
    });

    expect(filtered.tracks[0]?.takes.map(take => take.label)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]);
    expect(
      filtered.tracks.find(track => track.number === 24)?.takes.map(take => take.label)
    ).toEqual(['A']);
  });

  it('hides a previous-pass downvote and keeps the never-voted singleton', () => {
    const filtered = filterVersionForPass({
      version: oneLetters,
      currentRound: 10,
      votes: [{ versionSlug: 'v1', trackNumber: 1, takeLabel: 'D', round: 9, value: -1 }],
    });

    expect(filtered.tracks[0]?.takes.map(take => take.label)).toEqual(['A', 'B', 'C', 'E', 'F']);
    expect(
      filtered.tracks.find(track => track.number === 24)?.takes.map(take => take.label)
    ).toEqual(['A']);
  });

  it('on pass 10 keeps unvoted takes and current downvotes, hides earlier negatives', () => {
    const pass = buildConsolidatedPassVersion({
      versions: [oneLetters, twentyThreeLulu],
      currentRound: 10,
      votes: [
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', round: 9, value: 3 },
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'B', round: 9, value: -1 },
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'C', round: 10, value: -1 },
      ],
      tracklist: TRACKLIST,
    });

    const one = pass.tracks.find(track => track.number === 1);
    expect(one?.takes.map(take => take.voteLabel)).toEqual(['A', 'C', 'D', 'E', 'F']);
    expect(pass.tracks.find(track => track.number === 24)?.takes[0]?.voteLabel).toBe('A');
    expect(pass.tracks.find(track => track.number === 23)?.takes[0]?.label).toBe('Lulu A');
  });

  it('still drops downvotes', () => {
    const pass = buildConsolidatedPassVersion({
      versions: [oneLetters, twentyThreeLulu],
      currentRound: 10,
      votes: [
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', round: 9, value: 3 },
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'B', round: 8, value: -2 },
        { versionSlug: 'v1', trackNumber: 24, takeLabel: 'A', round: 9, value: -1 },
      ],
      tracklist: TRACKLIST,
    });

    const one = pass.tracks.find(track => track.number === 1);
    expect(one?.takes.map(take => take.voteLabel)).toEqual(['A', 'C', 'D', 'E', 'F']);
    expect(pass.tracks.find(track => track.number === 24)).toBeUndefined();
  });

  it('still carries positives', () => {
    const carried = votesToCarryForward(
      [
        { versionSlug: 'v1', trackNumber: 24, takeLabel: 'A', round: 9, value: 2 },
        { versionSlug: 'v2', trackNumber: 23, takeLabel: 'A', round: 9, value: 2 },
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', round: 8, value: 3 },
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'B', round: 8, value: -1 },
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'C', round: 8, value: 0 },
      ],
      10
    );

    expect(carried).toEqual([
      { versionSlug: 'v1', trackNumber: 24, takeLabel: 'A', value: 2, round: 10 },
      { versionSlug: 'v2', trackNumber: 23, takeLabel: 'A', value: 2, round: 10 },
      { versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', value: 3, round: 10 },
    ]);

    const pass = buildConsolidatedPassVersion({
      versions: [oneLetters, twentyThreeLulu],
      currentRound: 10,
      votes: [
        { versionSlug: 'v1', trackNumber: 24, takeLabel: 'A', round: 9, value: 2 },
        { versionSlug: 'v2', trackNumber: 23, takeLabel: 'A', round: 9, value: 2 },
        { versionSlug: 'v1', trackNumber: 1, takeLabel: 'A', round: 8, value: 3 },
      ],
      tracklist: TRACKLIST,
    });

    expect(pass.tracks.find(track => track.number === 24)?.takes[0]?.voteLabel).toBe('A');
    expect(pass.tracks.find(track => track.number === 23)?.takes[0]?.label).toBe('Lulu A');
    expect(
      pass.tracks.find(track => track.number === 1)?.takes.map(take => take.voteLabel)
    ).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});
