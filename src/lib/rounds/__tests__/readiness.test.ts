import { describe, expect, it } from 'vitest';

import { checkRoundReadiness } from '../readiness';

const filename = 'v1-01-track-one-p1-takea.mp3';
const base = {
  roundId: 'round-1',
  expectedJobs: 1,
  expectedOutputs: 2,
  jobs: [
    {
      promptId: 'p1',
      status: 'complete',
      output: { takes: [{ filename, outputId: 'output-1', downloaded: true, uploaded: true }] },
    },
  ],
  provenance: [{ filename, promptId: 'p1', roundId: 'round-1', outputId: 'output-1' }],
  storedFilenames: [filename],
};

describe('round readiness', () => {
  it('accepts actual output counts only after every take is stored and attributed', () => {
    expect(checkRoundReadiness(base)).toEqual({ ready: true, problems: [], actualOutputs: 1 });
  });

  it('blocks a missing audio object or provenance mismatch', () => {
    const audit = checkRoundReadiness({ ...base, storedFilenames: [], provenance: [] });
    expect(audit.ready).toBe(false);
    expect(audit.problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('missing from audio storage'),
        expect.stringContaining('no matching take provenance'),
      ])
    );
  });
});
