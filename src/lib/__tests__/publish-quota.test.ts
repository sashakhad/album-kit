import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
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
