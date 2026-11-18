import { describe, expect, it } from 'vitest';

import { advanceLocalPass, applyLocalVote, emptyLocalBallot, readLocalStore } from '../local-pass';

describe('local pass ballot', () => {
  it('keeps a positive score on pass two and drops a negative one', () => {
    const scored = applyLocalVote(
      applyLocalVote(emptyLocalBallot(), 'take-a.mp3', 1),
      'take-b.mp3',
      -1
    );
    const next = advanceLocalPass(scored);
    expect(next.pass).toBe(2);
    expect(next.votes['take-a.mp3']).toBe(1);
    expect(next.votes['take-b.mp3']).toBeUndefined();
    expect(next.retired).toEqual(['take-b.mp3']);
    const again = advanceLocalPass(applyLocalVote(next, 'take-a.mp3', 1));
    expect(again.pass).toBe(3);
    expect(again.votes['take-a.mp3']).toBe(2);
    expect(again.retired).toEqual(['take-b.mp3']);
  });

  it('gives a second album its own pass and keeps the first album intact', () => {
    const first = advanceLocalPass(applyLocalVote(emptyLocalBallot(), 'take-a.mp3', 1));
    const store = readLocalStore({ albums: { 'album-one': first } }, 'album-two');
    expect(store.albums['album-one']?.pass).toBe(2);
    expect(store.albums['album-one']?.votes['take-a.mp3']).toBe(1);
    expect(store.albums['album-two']).toBeUndefined();
  });

  it('reads a legacy single-album ballot as the current album', () => {
    const store = readLocalStore(
      { selected: 'take-a.mp3', votes: { 'take-a.mp3': 2 } },
      'album-one'
    );
    expect(store.albums['album-one']).toMatchObject({
      pass: 1,
      selected: 'take-a.mp3',
      votes: { 'take-a.mp3': 2 },
    });
  });
});
