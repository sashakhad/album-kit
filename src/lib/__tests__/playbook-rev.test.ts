import { expect, it } from 'vitest';

import { lookupPlaybook, revisionFromCommit } from '../../../scripts/playbook-rev.mjs';

it('rejects a remembered or missing revision and keeps the printed sha', async () => {
  expect(() => revisionFromCommit({}, 'main')).toThrow(/did not load/);
  const sha = '104f40b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6';
  const revision = revisionFromCommit({ sha }, 'main');
  expect(revision).toMatchObject({
    ref: 'main',
    sha,
    short: '104f40b',
    remembered: false,
  });
  expect(revision.playbook).toBe(
    `https://raw.githubusercontent.com/sashakhad/album-kit/${sha}/grokbot/BOT.md`
  );

  const fetched = await lookupPlaybook('main', async function fakeFetch() {
    return {
      ok: true,
      json: async function body() {
        return { sha };
      },
    };
  });
  expect(fetched.sha).toBe(sha);
  expect(fetched.remembered).toBe(false);
  expect(fetched.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});
