import { describe, expect, it } from 'vitest';

import {
  canonicalTakeFilename,
  canonicalTakeProblem,
  contentTypeForFilename,
  isAudioFilename,
  parseCanonicalTake,
  parseTakeLabel,
  parseTrackNumber,
  titleFromFilename,
} from '../parse-filename';

describe('isAudioFilename', () => {
  it('accepts common audio extensions', () => {
    expect(isAudioFilename('01-track-one.mp3')).toBe(true);
    expect(isAudioFilename('take.WAV')).toBe(true);
    expect(isAudioFilename('notes.md')).toBe(false);
    expect(isAudioFilename('.mp3')).toBe(false);
  });
});

describe('parseTrackNumber', () => {
  it('reads a leading track number', () => {
    expect(parseTrackNumber('01-track-one.mp3')).toBe(1);
    expect(parseTrackNumber('01 Track One.mp3')).toBe(1);
    expect(parseTrackNumber('track-08.wav')).toBe(8);
    expect(parseTrackNumber('13.mp3')).toBe(13);
    expect(parseTrackNumber('v2-01-track-one-takea.mp3')).toBe(1);
    expect(parseTrackNumber('v3-13-track-thirteen-taked.mp3')).toBe(13);
    expect(parseTrackNumber('Track One.mp3')).toBeNull();
  });
});

describe('parseTakeLabel', () => {
  it('reads a trailing take letter', () => {
    expect(parseTakeLabel('v2-01-track-one-takea.mp3')).toBe('A');
    expect(parseTakeLabel('v3-09-track-nine-takef.mp3')).toBe('F');
    expect(parseTakeLabel('v1-27-track-twenty-seven-p12-takeaa.mp3')).toBe('AA');
    expect(parseTakeLabel('01-track-one.mp3')).toBeNull();
  });
});

describe('titleFromFilename', () => {
  it('turns leftover filename text into a title', () => {
    expect(titleFromFilename('99-bonus-extra.mp3')).toBe('Bonus Extra');
    expect(titleFromFilename('01-track-one.mp3')).toBe('Track One');
    expect(titleFromFilename('hidden-track.wav')).toBe('Hidden Track');
  });
});

describe('contentTypeForFilename', () => {
  it('maps extensions to audio content types', () => {
    expect(contentTypeForFilename('x.mp3')).toBe('audio/mpeg');
    expect(contentTypeForFilename('x.m4a')).toBe('audio/mp4');
    expect(contentTypeForFilename('x.txt')).toBeNull();
  });
});

describe('parseCanonicalTake', () => {
  it('reads set, track, slug, prompt lane and letter', () => {
    expect(parseCanonicalTake('v1-07-track-seven-p3-takee.mp3')).toEqual({
      setId: 'v1',
      trackNumber: 7,
      slug: 'track-seven',
      promptLane: 3,
      letter: 'E',
    });
    expect(parseCanonicalTake('v12-42-b1g-r00m-p10-takeab.mp3')).toEqual({
      setId: 'v12',
      trackNumber: 42,
      slug: 'b1g-r00m',
      promptLane: 10,
      letter: 'AB',
    });
  });

  it('rejects names that are not canonical', () => {
    const rejects = [
      'v1-07-track-seven-takee.mp3',
      'v1-7-track-seven-p3-takee.mp3',
      'v1-07-track-seven-p3-takee.wav',
      'v1-07-track-seven-p3-takeE.mp3',
      'v1-07-Track-Seven-p3-takee.mp3',
      'v1-07-track--seven-p3-takee.mp3',
      'v1-07-track-seven-p123-takee.mp3',
      'v1-07-track-seven-p3-takeabc.mp3',
      '07-track-seven-p3-takee.mp3',
      'takes/v1-07-track-seven-p3-takee.mp3',
      'v1-07-track-seven-p3-takee.mp3.mp3',
    ];
    for (const name of rejects) {
      expect(parseCanonicalTake(name), name).toBeNull();
    }
  });
});

describe('canonicalTakeProblem', () => {
  it('says nothing about a canonical name', () => {
    expect(canonicalTakeProblem('v1-07-track-seven-p3-takee.mp3')).toBeNull();
  });

  it('says what is wrong with a bad name', () => {
    expect(canonicalTakeProblem('v1-07-track-seven-p3-takee.wav')).toBe('must end in .mp3');
    expect(canonicalTakeProblem('v1-07-Track-Seven-p3-takee.mp3')).toBe('must be all lowercase');
    expect(canonicalTakeProblem('07-track-seven-p3-takee.mp3')).toBe(
      'must start with the set id, like v1-'
    );
    expect(canonicalTakeProblem('v1-7-track-seven-p3-takee.mp3')).toBe(
      'needs a two-digit track number after the set, like v1-07-'
    );
    expect(canonicalTakeProblem('v1-07-track-seven-takee.mp3')).toBe(
      'must end with the prompt lane and take letter, like -p3-takee.mp3'
    );
    expect(canonicalTakeProblem('v1-07-track--seven-p3-takee.mp3')).toBe(
      'the slug must be lowercase letters and digits joined by single dashes'
    );
  });
});

describe('canonicalTakeFilename', () => {
  it('builds the canonical name from its parts', () => {
    expect(
      canonicalTakeFilename({
        setId: 'v1',
        trackNumber: 7,
        slug: 'track-seven',
        promptLane: 3,
        letter: 'E',
      })
    ).toBe('v1-07-track-seven-p3-takee.mp3');
  });

  it('round-trips with parseCanonicalTake', () => {
    const name = 'v2-11-track-eleven-p12-takeaa.mp3';
    const parts = parseCanonicalTake(name);
    if (parts === null) {
      throw new Error('expected a canonical take');
    }
    expect(canonicalTakeFilename(parts)).toBe(name);
  });
});
