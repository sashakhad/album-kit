import { describe, expect, it } from 'vitest';

import { passDecisionCopy, passStatusLine } from '@/lib/votes/pass-copy';

describe('pass copy', () => {
  it('keeps pass 1 to the unscored count', () => {
    expect(passStatusLine({ visible: 6, unscored: 6, nextCut: 0 })).toBe('6 unscored takes');
    expect(passDecisionCopy({ pass: 1, visible: 6, nextCut: 0 })).toBe(
      'Start Pass 2? No takes will be cut.'
    );
  });

  it('names a cut when scores are mixed and leaves the rule unstated', () => {
    const status = passStatusLine({ visible: 6, unscored: 2, nextCut: 2 });
    expect(status).toBe('2 takes will be cut · 2 unscored takes');
    expect(status).not.toMatch(/dropped|positive|parked|zero/i);
    expect(passDecisionCopy({ pass: 1, visible: 6, nextCut: 2 })).toBe(
      'Start Pass 2? 2 takes will be cut. 4 takes will stay.'
    );
  });

  it('counts the takes still in play on a later pass', () => {
    expect(passStatusLine({ visible: 4, unscored: 0, nextCut: 0 })).toBe('4 scored takes');
    expect(passDecisionCopy({ pass: 2, visible: 4, nextCut: 0 })).toBe(
      'Start Pass 3? No takes will be cut.'
    );
    expect(passStatusLine({ visible: 4, unscored: 1, nextCut: 1 })).toBe(
      '1 take will be cut · 1 unscored take'
    );
  });
});
