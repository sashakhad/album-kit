import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = 'sashakhad/album-kit';

export function revisionFromCommit(body, ref) {
  const sha = body && typeof body.sha === 'string' ? body.sha : '';
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('The playbook revision did not load.');
  }
  return {
    ref,
    sha,
    short: sha.slice(0, 7),
    remembered: false,
    playbook: `https://raw.githubusercontent.com/${REPO}/${sha}/grokbot/BOT.md`,
    skill: `https://raw.githubusercontent.com/${REPO}/${sha}/.cursor/skills/<skill>/SKILL.md`,
  };
}

export async function lookupPlaybook(ref = 'main', fetchImpl) {
  const request = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  const url = `https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(ref)}`;
  const response = await request(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'album-kit',
    },
  });
  if (!response.ok) {
    throw new Error(`The playbook revision did not load (${response.status}).`);
  }
  const body = await response.json();
  return { ...revisionFromCommit(body, ref), fetchedAt: new Date().toISOString() };
}

function requestedRef(args) {
  const flag = args.indexOf('--ref');
  if (flag === -1) return 'main';
  const ref = args[flag + 1];
  if (typeof ref !== 'string' || ref.length === 0 || ref.startsWith('--')) {
    throw new Error('Usage: node scripts/playbook-rev.mjs [--ref <branch-or-sha>]');
  }
  return ref;
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(await lookupPlaybook(requestedRef(process.argv.slice(2)))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
