import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [, , command, ...args] = process.argv;

export const PROGRESS_UNREAD =
  'Progress unread. Open the site before stating whether takes are still generating.';

/**
 * A progress line even when the site omits `line`. Never throws.
 * @param {unknown} progress
 */
export function progressLineFrom(progress) {
  if (!isRecord(progress)) {
    return PROGRESS_UNREAD;
  }
  if (typeof progress.line === 'string' && progress.line.trim().length > 0) {
    return progress.line.trim();
  }
  const ready = finiteNumber(progress.takesReady);
  const expected = finiteNumber(progress.takesExpected);
  if (ready === null || expected === null) {
    return PROGRESS_UNREAD;
  }
  const finished = finiteNumber(progress.jobsFinished) ?? 0;
  const jobs = finiteNumber(progress.jobsExpected) ?? 0;
  const round =
    typeof progress.roundNumber === 'number' && Number.isFinite(progress.roundNumber)
      ? `Round ${progress.roundNumber}`
      : 'This round';
  return `${round}: ${finished}/${jobs} done, ${ready} of ${expected} takes ready.`;
}

/**
 * Chat-ready progress. Includes the site and any track that is already playable.
 * @param {{ siteUrl: string, progress: unknown }} report
 */
export function formatProgressReport({ siteUrl, progress }) {
  const lines = [progressLineFrom(progress), `Site: ${siteUrl}`];
  if (isRecord(progress) && Array.isArray(progress.liveTracks)) {
    for (const track of progress.liveTracks) {
      if (
        !isRecord(track) ||
        typeof track.path !== 'string' ||
        !/^\/(vote|listen)(\/|$)/.test(track.path) ||
        typeof track.trackNumber !== 'number'
      ) {
        continue;
      }
      const title =
        typeof track.title === 'string' && track.title.length > 0 ? track.title : 'Track';
      lines.push(`Track ${track.trackNumber} ${title}: ${siteUrl}${track.path}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Chat-ready lines. The owner password is never one of them.
 * @param {{ siteUrl: string, progressLine?: string, ownerLink?: string }} lines
 */
export function formatChatLines({ siteUrl, progressLine, ownerLink }) {
  const lines = [];
  if (typeof progressLine === 'string' && progressLine.length > 0) {
    lines.push(progressLine);
  }
  lines.push(`Site: ${siteUrl}`);
  if (typeof ownerLink === 'string' && ownerLink.length > 0) {
    lines.push(`Owner: ${ownerLink}`);
    lines.push('Works once. Valid for 7 days. This browser stays signed in after you continue.');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  let site;
  let key;
  try {
    site = new URL(JSON.parse(readFileSync('.album-site.json', 'utf8')).siteUrl);
    key = readFileSync('.album-key', 'utf8').trim();
    if (
      !key ||
      (site.protocol !== 'https:' && !(site.protocol === 'http:' && site.hostname === 'localhost'))
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(
      'Open the album checkout with its .album-site.json and .album-key, or run pnpm setup:site first.'
    );
  }

  let route;
  let method = 'GET';
  let body;
  if (command === 'link' && args.length <= 1) {
    route = '/api/owner/sign-in-links';
    method = 'POST';
    body = { next: args[0] ?? '/settings' };
  } else if (command === 'settings' && args.length === 0) {
    route = '/api/owner/settings';
  } else if (command === 'settings' && args.length === 1 && args[0] === '--patch') {
    route = '/api/owner/settings';
    method = 'PATCH';
    body = { patch: JSON.parse(readFileSync(0, 'utf8')) };
  } else if (command === 'progress' && args.length === 0) {
    const siteUrl = site.href.replace(/\/$/, '');
    const progress = await readProgress(site, key);
    const text = formatProgressReport({ siteUrl, progress });
    if (text.includes(key)) {
      throw new Error('Refusing to print progress that contains the owner password.');
    }
    process.stdout.write(text);
    return;
  } else {
    throw new Error(
      'Use pnpm owner:link [/settings|/vote|/stats|/status], pnpm album:settings [--patch], or pnpm album:progress. Pass a JSON patch on stdin.'
    );
  }

  const response = await fetch(new URL(route, site), {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof result?.error === 'string'
        ? result.error
        : `The album site returned ${response.status}.`
    );
  }
  const siteUrl = site.href.replace(/\/$/, '');
  if (command === 'link') {
    const link = new URL(result?.link);
    if (
      link.origin !== site.origin ||
      link.pathname !== '/key' ||
      !/^#owner=[A-Za-z0-9_-]{43}$/.test(link.hash) ||
      link.href.includes(key)
    ) {
      throw new Error('The album site did not return a valid owner link.');
    }
    process.stdout.write(formatChatLines({ siteUrl, ownerLink: link.href }));
  } else {
    if (result?.resolved === undefined)
      throw new Error('The album site did not return its settings.');
    process.stdout.write(`${JSON.stringify(result.resolved, null, 2)}\n`);
  }
}

class OwnerAuthError extends Error {}

async function readProgress(site, key) {
  let fallback = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(new URL('/api/owner/progress', site), {
        method: 'GET',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      });
      const result = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        throw new OwnerAuthError(
          typeof result?.error === 'string' ? result.error : 'Owner key required'
        );
      }
      if (response.ok && progressLineFrom(result) !== PROGRESS_UNREAD) {
        return result;
      }
      if (result !== null) {
        fallback = result;
      }
    } catch (error) {
      if (error instanceof OwnerAuthError) {
        throw error;
      }
    }
  }
  return fallback ?? {};
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'The album site is unavailable.'}\n`
    );
    process.exitCode = 1;
  });
}
