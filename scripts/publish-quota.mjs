#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PUBLISH_CAP = 100;

export const lowPublishQuota =
  'Suno allows 100 public publishes a day. This batch needs more than are left, so I’m not starting it.';

export const unreadPublishQuota =
  'I have not read how many public publishes are left today. I’m not starting until I know this batch fits.';

export function publishQuotaDecision({ remaining, takes }) {
  const count = typeof takes === 'number' ? takes : Number(takes);
  if (!Number.isInteger(count) || count < 1) {
    return { ok: false, say: unreadPublishQuota, remaining: null, takes: null, cap: PUBLISH_CAP };
  }
  if (remaining === 'unknown' || remaining === null || remaining === undefined) {
    return { ok: false, say: unreadPublishQuota, remaining: null, takes: count, cap: PUBLISH_CAP };
  }
  const left = typeof remaining === 'number' ? remaining : Number(remaining);
  if (!Number.isInteger(left) || left < 0) {
    return { ok: false, say: unreadPublishQuota, remaining: null, takes: count, cap: PUBLISH_CAP };
  }
  if (left < count) {
    return { ok: false, say: lowPublishQuota, remaining: left, takes: count, cap: PUBLISH_CAP };
  }
  return { ok: true, say: null, remaining: left, takes: count, cap: PUBLISH_CAP };
}

function argument(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return undefined;
  return args[index + 1];
}

export function decisionFromArgs(args) {
  const takes = argument(args, '--takes');
  const remaining = argument(args, '--remaining');
  if (takes === undefined || remaining === undefined) {
    return {
      ok: false,
      say: 'Usage: node scripts/publish-quota.mjs --remaining <left|unknown> --takes <count>',
      remaining: null,
      takes: null,
      cap: PUBLISH_CAP,
    };
  }
  return publishQuotaDecision({
    remaining: remaining === 'unknown' ? 'unknown' : Number(remaining),
    takes: Number(takes),
  });
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const decision = decisionFromArgs(process.argv.slice(2));
  console.log(JSON.stringify(decision));
  if (!decision.ok) process.exitCode = 1;
}
