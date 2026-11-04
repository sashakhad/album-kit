import { describe, expect, it } from 'vitest';

import { parseByteRange } from '../byte-range';

describe('parseByteRange', () => {
  it('parses start-end and open-ended ranges', () => {
    expect(parseByteRange('bytes=0-1023', 2048)).toEqual({ start: 0, end: 1023 });
    expect(parseByteRange('bytes=1024-', 2048)).toEqual({ start: 1024, end: 2047 });
    expect(parseByteRange('bytes=-500', 2048)).toEqual({ start: 1548, end: 2047 });
  });

  it('rejects unsatisfiable ranges', () => {
    expect(parseByteRange('bytes=4096-5000', 2048)).toBeNull();
    expect(parseByteRange('bytes=', 2048)).toBeNull();
    expect(parseByteRange('items=0-1', 2048)).toBeNull();
  });
});
