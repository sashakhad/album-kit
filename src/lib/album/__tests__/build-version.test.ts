import { describe, expect, it } from 'vitest';

import { buildVersion, type CanonicalTrack } from '../build-version';

const TRACKLIST: CanonicalTrack[] = [
  { number: 1, title: 'Track One', slug: 'track-one' },
  { number: 2, title: 'Track Two', slug: 'track-two' },
  { number: 3, title: 'Track Three', slug: 'track-three' },
  { number: 5, title: 'Track Five', slug: 'track-five' },
  { number: 6, title: 'Track Six', slug: 'track-six' },
  { number: 8, title: 'Track Eight', slug: 'track-eight' },
  { number: 10, title: 'Track Ten', slug: 'track-ten' },
  { number: 14, title: 'Track Fourteen', slug: 'track-fourteen' },
  { number: 15, title: 'Track Fifteen', slug: 'track-fifteen' },
  { number: 16, title: 'Track Sixteen', slug: 'track-sixteen' },
  { number: 17, title: 'Track Seventeen', slug: 'track-seventeen' },
  { number: 18, title: 'Track Eighteen', slug: 'track-eighteen' },
  { number: 21, title: 'Track Twenty-One', slug: 'track-twenty-one', parked: true },
  { number: 27, title: 'Track Twenty-Seven', slug: 'track-twenty-seven' },
];

const BUBU = {
  title: 'Bubu',
  author: 'Bubu',
  blurb: 'First prompt set.',
  publicSlug: 'v1',
};

describe('buildVersion', () => {
  it('matches numbered audio onto the tracklist and keeps extras as bonus tracks', () => {
    const prompts = new Map<number, string>([[1, 'Warm and wide.']]);
    const version = buildVersion({
      folder: 'v1',
      meta: { ...BUBU, publicSlug: null },
      audioFiles: ['01-track-one.mp3', '99-bonus-extra.wav', '01 Track One.mp3'],
      prompts,
      tracklist: TRACKLIST.slice(0, 2),
    });

    const first = version.tracks[0];
    expect(first?.title).toBe('Track One');
    expect(first?.filename).toBe('01 Track One.mp3');
    expect(first?.audioUrl).toBe(`/api/audio/v1/${encodeURIComponent('01 Track One.mp3')}`);
    expect(first?.prompt).toBe('Warm and wide.');
    expect(first?.takes.map(take => take.filename)).toEqual([
      '01 Track One.mp3',
      '01-track-one.mp3',
    ]);

    const second = version.tracks[1];
    expect(second?.title).toBe('Track Two');
    expect(second?.audioUrl).toBeNull();

    const bonus = version.tracks[version.tracks.length - 1];
    expect(bonus?.kind).toBe('bonus');
    expect(bonus?.title).toBe('Bonus Extra');
    expect(bonus?.audioUrl).toContain('99-bonus-extra.wav');
  });

  it('groups versioned take files onto one track', () => {
    const version = buildVersion({
      folder: 'set-two',
      meta: { title: 'Lulu', author: 'Lulu', blurb: 'Second prompt set.', publicSlug: 'v2' },
      audioFiles: [
        'v2-01-track-one-p1-takeb.mp3',
        'v2-01-track-one-p1-takea.mp3',
        'v2-01-track-one-p2-takec.mp3',
      ],
      prompts: new Map(),
      tracklist: TRACKLIST,
    });

    const first = version.tracks[0];
    expect(first?.takes.map(take => take.label)).toEqual(['A', 'B', 'C']);
    expect(first?.filename).toBe('v2-01-track-one-p1-takea.mp3');
    expect(first?.audioUrl).toContain('/api/audio/v2/');
    expect(version.slug).toBe('v2');
    expect(version.folder).toBe('set-two');
    expect(version.title).toBe('Lulu');
    expect(version.tracks.some(track => track.kind === 'bonus')).toBe(false);
  });

  it('keeps a label gap when a take moves to another track', () => {
    const version = buildVersion({
      folder: 'v1',
      meta: BUBU,
      audioFiles: [
        'v1-02-track-two-p1-takea.mp3',
        'v1-02-track-two-p1-takeb.mp3',
        'v1-02-track-two-p1-takec.mp3',
        'v1-02-track-two-p1-taked.mp3',
        'v1-02-track-two-p3-takef.mp3',
        'v1-02-track-two-p4-takeg.mp3',
        'v1-15-track-fifteen-p2-takea.mp3',
      ],
      prompts: new Map(),
      tracklist: TRACKLIST,
    });

    const two = version.tracks.find(item => item.number === 2);
    expect(two?.takes.map(take => take.label)).toEqual(['A', 'B', 'C', 'D', 'F', 'G']);

    const fifteen = version.tracks.find(item => item.number === 15);
    expect(fifteen?.title).toBe('Track Fifteen');
    expect(fifteen?.kind).toBe('album');
    expect(fifteen?.takes.map(take => take.label)).toEqual(['A']);
  });

  it('keeps the other letters when a take is extracted to a new track', () => {
    const version = buildVersion({
      folder: 'v1',
      meta: BUBU,
      audioFiles: [
        'v1-06-track-six-p1-takea.mp3',
        'v1-06-track-six-p1-takeb.mp3',
        'v1-06-track-six-p2-takec.mp3',
        'v1-16-track-sixteen-p1-takea.mp3',
      ],
      prompts: new Map(),
      tracklist: TRACKLIST,
    });

    expect(version.tracks.find(item => item.number === 6)?.takes.map(take => take.label)).toEqual([
      'A',
      'B',
      'C',
    ]);
    const sixteen = version.tracks.find(item => item.number === 16);
    expect(sixteen?.title).toBe('Track Sixteen');
    expect(sixteen?.kind).toBe('album');
    expect(sixteen?.takes.map(take => take.label)).toEqual(['A']);
  });

  it('keeps extra takes with their own letters on the same track', () => {
    const version = buildVersion({
      folder: 'v1',
      meta: BUBU,
      audioFiles: [
        'v1-03-track-three-remix-p2-takee.mp3',
        'v1-03-track-three-remix-p2-takef.mp3',
        'v1-03-track-three-p1-takea.mp3',
        'v1-03-track-three-p1-takeb.mp3',
        'v1-03-track-three-p1-taked.mp3',
        'v1-18-track-eighteen-p1-takea.mp3',
      ],
      prompts: new Map(),
      tracklist: TRACKLIST,
    });

    expect(version.tracks.find(item => item.number === 3)?.takes.map(take => take.label)).toEqual([
      'A',
      'B',
      'D',
      'E',
      'F',
    ]);
    const eighteen = version.tracks.find(item => item.number === 18);
    expect(eighteen?.kind).toBe('album');
    expect(eighteen?.takes.map(take => take.label)).toEqual(['A']);
  });

  it('puts a moved file on its new track and leaves no bonus behind', () => {
    const version = buildVersion({
      folder: 'v1',
      meta: BUBU,
      audioFiles: [
        'v1-05-track-five-harder-p1-takeb.mp3',
        'v1-05-track-five-harder-p2-taked.mp3',
        'v1-05-track-five-p1-takea.mp3',
        'v1-08-track-eight-p1-takea.mp3',
      ],
      prompts: new Map(),
      tracklist: TRACKLIST,
    });

    expect(version.tracks.find(item => item.number === 5)?.takes.map(take => take.label)).toEqual([
      'A',
      'B',
      'D',
    ]);
    const eight = version.tracks.find(item => item.number === 8);
    expect(eight?.title).toBe('Track Eight');
    expect(eight?.kind).toBe('album');
    expect(eight?.takes.map(take => take.label)).toEqual(['A']);
    expect(version.tracks.some(item => item.kind === 'bonus')).toBe(false);
  });

  it('maps prompt batches onto takes A through J and keeps the parked flag', () => {
    const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const version = buildVersion({
      folder: 'v1',
      meta: BUBU,
      audioFiles: letters.map(
        (letter, index) => `v1-21-track-twenty-one-p${Math.floor(index / 2) + 1}-take${letter}.mp3`
      ),
      prompts: new Map(),
      tracklist: TRACKLIST,
    });

    const parked = version.tracks.find(item => item.number === 21);
    expect(parked?.title).toBe('Track Twenty-One');
    expect(parked?.kind).toBe('album');
    expect(parked?.parked).toBe(true);
    expect(parked?.takes.map(take => take.label)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'I',
      'J',
    ]);
  });

  it('keeps A stable when a later batch arrives', () => {
    const version = buildVersion({
      folder: 'v1',
      meta: BUBU,
      audioFiles: [
        'v1-05-track-five-harder-p1-takeb.mp3',
        'v1-05-track-five-harder-p1-takec.mp3',
        'v1-05-track-five-harder-p2-taked.mp3',
        'v1-05-track-five-harder-p2-takee.mp3',
        'v1-05-track-five-p1-takea.mp3',
      ],
      prompts: new Map(),
      tracklist: TRACKLIST,
    });

    const five = version.tracks.find(item => item.number === 5);
    expect(five?.takes.map(take => take.label)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(five?.takes.find(take => take.label === 'A')?.filename).toBe(
      'v1-05-track-five-p1-takea.mp3'
    );
  });

  it('puts numbered extras on their track instead of bonus', () => {
    const version = buildVersion({
      folder: 'v1',
      meta: BUBU,
      audioFiles: [
        'v1-14-track-fourteen-p1-takea.mp3',
        'v1-14-track-fourteen-p1-takeb.mp3',
        'v1-14-track-fourteen-p2-takea.mp3',
        'v1-14-track-fourteen-remix-p1-takea.mp3',
        'v1-14-track-fourteen-remix-p1-takeb.mp3',
      ],
      prompts: new Map(),
      tracklist: TRACKLIST,
    });

    const fourteen = version.tracks.find(item => item.number === 14);
    expect(fourteen?.title).toBe('Track Fourteen');
    expect(fourteen?.kind).toBe('album');
    expect(fourteen?.takes.map(take => take.label)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(fourteen?.takes.find(take => take.label === 'D')?.filename).toBe(
      'v1-14-track-fourteen-remix-p1-takea.mp3'
    );
    expect(version.tracks.some(item => item.kind === 'bonus')).toBe(false);
  });

  it('sorts two-letter takes after A and keeps late letters', () => {
    const version = buildVersion({
      folder: 'v1',
      meta: BUBU,
      audioFiles: [
        'v1-10-track-ten-p1-takea.mp3',
        'v1-27-track-twenty-seven-moved-p5-takey.mp3',
        'v1-27-track-twenty-seven-moved-p5-takez.mp3',
        'v1-27-track-twenty-seven-p1-takea.mp3',
        'v1-27-track-twenty-seven-p12-takeaa.mp3',
      ],
      prompts: new Map(),
      tracklist: TRACKLIST,
    });

    expect(version.tracks.find(item => item.number === 10)?.takes.map(take => take.label)).toEqual([
      'A',
    ]);
    const late = version.tracks.find(item => item.number === 27);
    expect(late?.takes.map(take => take.label)).toEqual(['A', 'AA', 'Y', 'Z']);
    expect(late?.takes.find(take => take.label === 'Y')?.filename).toBe(
      'v1-27-track-twenty-seven-moved-p5-takey.mp3'
    );
  });

  it('sorts files by name before giving out letters that collide', () => {
    const version = buildVersion({
      folder: 'v1',
      meta: BUBU,
      audioFiles: ['v1-17-track-seventeen-takea.mp3', 'v1-17-track-seventeen-remix-takea.mp3'],
      prompts: new Map(),
      tracklist: TRACKLIST,
    });

    const seventeen = version.tracks.find(item => item.number === 17);
    expect(seventeen?.takes.map(take => [take.label, take.filename])).toEqual([
      ['A', 'v1-17-track-seventeen-remix-takea.mp3'],
      ['B', 'v1-17-track-seventeen-takea.mp3'],
    ]);
  });
});
