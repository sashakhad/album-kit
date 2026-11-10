import { describe, expect, it } from 'vitest';

import { LISTENER_VOTE_CAP, budgetAllows, nextListenerValue } from '@/lib/votes/abuse';

describe('listener abuse bounds', () => {
  it('caps one listener ballot and counts attempts inside the window', () => {
    expect(nextListenerValue(LISTENER_VOTE_CAP, 1, LISTENER_VOTE_CAP)).toBeNull();
    expect(nextListenerValue(LISTENER_VOTE_CAP, -1, LISTENER_VOTE_CAP)).toBe(LISTENER_VOTE_CAP - 1);
    expect(budgetAllows(29, 30)).toBe(true);
    expect(budgetAllows(30, 30)).toBe(false);
  });
});
