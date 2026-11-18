#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLISH_CAP = 100;

export const lowPublishQuota =
  'Suno allows 100 public publishes a day. This batch needs more than are left, so I’m not starting it.';

export const unreadPublishQuota =
  'I have not read how many public publishes are left today. I’m not starting until I know this batch fits.';

export function freeQuotaSay(made, takes) {
  return `Suno Free does not show how many public publishes are left. I've published ${made} today. This batch needs ${takes}. The cap is 100 a day.`;
}

function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function ledgerFile(root) {
  return path.join(root, '.tmp', 'publish-quota.json');
}

export function readMade(root, now = new Date()) {
  try {
    const value = JSON.parse(readFileSync(ledgerFile(root), 'utf8'));
    if (value && value.day === dayKey(now) && Number.isInteger(value.made) && value.made >= 0) {
      return value.made;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return 0;
}

function writeMade(root, made, now = new Date()) {
  const directory = path.join(root, '.tmp');
  mkdirSync(directory, { recursive: true });
  const pending = path.join(directory, 'publish-quota-pending.json');
  writeFileSync(pending, JSON.stringify({ day: dayKey(now), made }), { mode: 0o600 });
  renameSync(pending, ledgerFile(root));
}

export function recordPublish(root, now = new Date()) {
  const made = readMade(root, now) + 1;
  writeMade(root, made, now);
  return { ok: true, say: null, made, takes: null, cap: PUBLISH_CAP, source: 'session' };
}

export function freeQuotaDecision(made, takes) {
  const count = typeof takes === 'number' ? takes : Number(takes);
  const published = typeof made === 'number' ? made : Number(made);
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(published) || published < 0) {
    return {
      ok: false,
      say: unreadPublishQuota,
      remaining: null,
      made: null,
      takes: null,
      cap: PUBLISH_CAP,
      source: 'session',
    };
  }
  if (published + count > PUBLISH_CAP) {
    return {
      ok: false,
      say: lowPublishQuota,
      remaining: PUBLISH_CAP - published,
      made: published,
      takes: count,
      cap: PUBLISH_CAP,
      source: 'session',
    };
  }
  return {
    ok: true,
    say: freeQuotaSay(published, count),
    remaining: PUBLISH_CAP - published,
    made: published,
    takes: count,
    cap: PUBLISH_CAP,
    source: 'session',
  };
}

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

export function decisionFromArgs(args, root = process.cwd()) {
  const takes = argument(args, '--takes');
  const album = argument(args, '--root') ?? root;
  if (args.includes('--record')) {
    return recordPublish(album);
  }
  if (args.includes('--free')) {
    if (takes === undefined) {
      return {
        ok: false,
        say: 'Usage: node scripts/publish-quota.mjs --free --takes <count>',
        remaining: null,
        takes: null,
        cap: PUBLISH_CAP,
      };
    }
    return freeQuotaDecision(readMade(album), Number(takes));
  }
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
