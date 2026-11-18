#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { devNull } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = 'sashakhad/album-kit';
const kitSource = `https://github.com/${repository}`;
const commit = /^[a-f0-9]{40}$/i;
const timeout = 3500;

function git(args, cwd, env = process.env) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout,
    env: { ...env, GIT_TERMINAL_PROMPT: '0' },
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function readInstalledRevision(root) {
  try {
    const config = JSON.parse(readFileSync(path.join(root, '.album-site.json'), 'utf8'));
    if (typeof config.kitRevision === 'string' && commit.test(config.kitRevision)) {
      return config.kitRevision.toLowerCase();
    }
  } catch {
    // A copied kit need not have a site or a Git repository.
  }
  if (!existsSync(path.join(root, '.git'))) return null;
  const cached = git(['rev-parse', '--verify', 'refs/remotes/kit/main'], root);
  // A fetched tracking ref alone says nothing about which release was installed.
  return cached &&
    commit.test(cached) &&
    git(['merge-base', '--is-ancestor', cached, 'HEAD'], root) === ''
    ? cached
    : null;
}

function validRef(ref) {
  return (
    typeof ref === 'string' &&
    ref.length > 0 &&
    ref !== '@' &&
    ref !== 'HEAD' &&
    !ref.startsWith('-') &&
    !ref.endsWith('.') &&
    !ref.includes('..') &&
    !ref.includes('@{') &&
    !/[\s\x00-\x1f\x7f~^:?*\[\\]/u.test(ref) &&
    ref.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock'))
  );
}

async function lookup(ref, request, root) {
  const sha = commit.test(ref);
  const api = `https://api.github.com/repos/${repository}/git/`;
  const selector = sha
    ? `commits/${ref}`
    : `ref/heads/${ref.split('/').map(encodeURIComponent).join('/')}`;
  try {
    const response = await request(api + selector, {
      signal: AbortSignal.timeout(timeout),
      headers: { Accept: 'application/vnd.github+json' },
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    if (response.ok) {
      const data = await response.json();
      const revision = sha ? data.sha : data.object?.sha;
      if (
        typeof revision !== 'string' ||
        !commit.test(revision) ||
        (sha
          ? revision.toLowerCase() !== ref.toLowerCase()
          : data.ref !== `refs/heads/${ref}` || data.object?.type !== 'commit')
      )
        return null;
      return revision.toLowerCase();
    }
    if (response.status === 404 || response.status === 422) return null;
  } catch {
    // An existing album may still be able to reach the public Git transport.
  }
  if (!existsSync(path.join(root, '.git'))) return null;
  const remote = git(['remote', 'get-url', 'kit'], root);
  if (
    sha ||
    !/^(?:https:\/\/github\.com\/|git@github\.com:)sashakhad\/album-kit(?:\.git)?\/?$/.test(
      remote ?? ''
    )
  )
    return null;
  const name = `refs/heads/${ref}`;
  // Ignore helpers, stored headers and URL rewrites even in a signed-in checkout.
  const line = git(
    ['ls-remote', '--refs', kitSource + '.git', name],
    path.parse(path.resolve(root)).root,
    {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: devNull,
    }
  );
  const [revision, returnedRef] = line?.split(/\s+/) ?? [];
  return returnedRef === name && commit.test(revision) ? revision.toLowerCase() : null;
}

export async function checkKit({ root = process.cwd(), ref = 'main', request = fetch } = {}) {
  if (!validRef(ref))
    throw new Error('Expected a branch name or full commit SHA from the public album kit.');
  const installedRevision = readInstalledRevision(root);
  const currentRevision = await lookup(ref, request, root);
  const base = currentRevision
    ? `https://raw.githubusercontent.com/${repository}/${currentRevision}`
    : null;
  return {
    kitSource,
    ref,
    installedRevision,
    currentRevision,
    status:
      !installedRevision || !currentRevision
        ? 'unverified'
        : installedRevision === currentRevision
          ? 'current'
          : 'update-available',
    botUrl: base ? base + '/grokbot/BOT.md' : null,
    skillsBaseUrl: base ? base + '/.cursor/skills/' : null,
  };
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--ref')) {
      throw new Error('Usage: node scripts/check-kit.mjs [--ref <branch-or-SHA>]');
    }
    console.log(JSON.stringify(await checkKit({ ref: args[1] }), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
