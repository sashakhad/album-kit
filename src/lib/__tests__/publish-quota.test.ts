import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  decisionFromArgs,
  freeQuotaSay,
  lowPublishQuota,
  publishQuotaDecision,
  unreadPublishQuota,
} from '../../../scripts/publish-quota.mjs';

it('warns before a batch that does not fit the public-publish cap', () => {
  expect(publishQuotaDecision({ remaining: 80, takes: 8 })).toMatchObject({ ok: true, say: null });
  expect(publishQuotaDecision({ remaining: 7, takes: 8 })).toMatchObject({
    ok: false,
    say: lowPublishQuota,
    cap: 100,
  });
  expect(publishQuotaDecision({ remaining: 'unknown', takes: 8 })).toMatchObject({
    ok: false,
    say: unreadPublishQuota,
  });
  expect(lowPublishQuota).toContain('100 public publishes a day');
  expect(lowPublishQuota).toContain('not starting');
});

it('fails closed from the command when the remaining count was not read', () => {
  const script = path.resolve('scripts/publish-quota.mjs');
  let failed = false;
  try {
    execFileSync(process.execPath, [script, '--remaining', 'unknown', '--takes', '8'], {
      encoding: 'utf8',
    });
  } catch (error) {
    failed = true;
    const thrown = error as { status?: number; stdout?: string };
    expect(thrown.status).toBe(1);
    expect(JSON.parse(thrown.stdout ?? '').say).toBe(unreadPublishQuota);
  }
  expect(failed).toBe(true);

  const ready = execFileSync(process.execPath, [script, '--remaining', '40', '--takes', '8'], {
    encoding: 'utf8',
  });
  expect(JSON.parse(ready)).toMatchObject({ ok: true, remaining: 40, takes: 8 });
});

it('counts Free publishes itself and says when Suno shows no number', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'publish-quota-'));
  try {
    const first = decisionFromArgs(['--free', '--takes', '4', '--root', root]);
    expect(first.ok).toBe(true);
    expect(first.say).toBe(freeQuotaSay(0, 4));
    expect(first.say).toContain('not the account total');
    expect(first.say).toContain('album folder');

    expect(decisionFromArgs(['--record', '--root', root])).toMatchObject({ made: 1 });
    expect(decisionFromArgs(['--record', '--root', root])).toMatchObject({ made: 2 });
    const later = decisionFromArgs(['--free', '--takes', '4', '--root', root]);
    expect(later).toMatchObject({ ok: true, made: 2, say: freeQuotaSay(2, 4) });

    const full = decisionFromArgs(['--free', '--takes', '99', '--root', root]);
    expect(full).toMatchObject({ ok: false, say: lowPublishQuota, made: 2 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
