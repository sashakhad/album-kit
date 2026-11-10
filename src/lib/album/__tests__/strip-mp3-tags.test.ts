import { describe, expect, it } from 'vitest';

import { stripMp3Tags } from '../strip-mp3-tags';

describe('stripMp3Tags', () => {
  it('removes ID3v2 and ID3v1 containers while preserving audio bytes', () => {
    const head = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 3, 1, 2, 3]);
    const audio = new Uint8Array([0xff, 0xfb, 0x44, 0x55]);
    const tail = new Uint8Array(128);
    tail.set([84, 65, 71]);
    const combined = new Uint8Array(head.length + audio.length + tail.length);
    combined.set(head);
    combined.set(audio, head.length);
    combined.set(tail, head.length + audio.length);
    expect(Array.from(stripMp3Tags(combined))).toEqual(Array.from(audio));
  });
});
