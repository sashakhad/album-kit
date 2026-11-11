import { readFileSync } from 'node:fs';

const [, , command, ...args] = process.argv;

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
  } else {
    throw new Error(
      'Use pnpm owner:link [/settings|/vote|/final] or pnpm album:settings [--patch]. Pass a JSON patch on stdin.'
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
  if (command === 'link') {
    const link = new URL(result?.link);
    if (
      link.origin !== site.origin ||
      link.pathname !== '/key' ||
      !/^#owner=[A-Za-z0-9_-]{43}$/.test(link.hash)
    ) {
      throw new Error('The album site did not return a valid owner link.');
    }
    process.stdout.write(`${link.href}\n`);
  } else {
    if (result?.resolved === undefined)
      throw new Error('The album site did not return its settings.');
    process.stdout.write(`${JSON.stringify(result.resolved, null, 2)}\n`);
  }
}

main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'The album site is unavailable.'}\n`
  );
  process.exitCode = 1;
});
