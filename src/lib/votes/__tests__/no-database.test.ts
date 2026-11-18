// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getVisitorCurrentRound, loadParkedTakes, loadPassVotes } from '@/lib/votes/pass-store';

describe('fresh site without a database', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', '');
  });

  it('does not open Prisma for the listener pass', async () => {
    await expect(getVisitorCurrentRound('listener')).resolves.toBe(1);
    await expect(loadPassVotes('listener')).resolves.toEqual([]);
    await expect(loadParkedTakes()).resolves.toEqual([]);
  });
});
