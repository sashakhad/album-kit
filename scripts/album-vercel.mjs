// The kit repo keeps git.deploymentEnabled.main false so its own main branch
// does not deploy production. Album repositories must deploy from main.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const KIT_REPO = 'sashakhad/album-kit';

export function albumVercelText(source) {
  const parsed = JSON.parse(source);
  const enabled = parsed?.git?.deploymentEnabled;
  if (enabled === null || typeof enabled !== 'object' || enabled.main !== false) {
    return source.endsWith('\n') ? source : `${source}\n`;
  }
  delete enabled.main;
  if (Object.keys(enabled).length === 0) {
    delete parsed.git.deploymentEnabled;
  }
  if (
    parsed.git !== null &&
    typeof parsed.git === 'object' &&
    Object.keys(parsed.git).length === 0
  ) {
    delete parsed.git;
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function repoPath(url) {
  const match = /[/:]([^/:]+)\/([^/]+?)(?:\.git)?\/*$/.exec(url.trim());
  return match === null ? null : `${match[1]}/${match[2]}`.toLowerCase();
}

function git(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' });
}

export function writeAlbumVercelConfig(root) {
  const file = path.join(root, 'vercel.json');
  const source = readText(file);
  if (source === null) {
    return false;
  }
  const next = albumVercelText(source);
  if (next === source) {
    return false;
  }
  writeFileSync(file, next);
  return true;
}

/**
 * Rewrite vercel.json in an album checkout so a push to main deploys production.
 * Does nothing when origin is this kit. Commits the file. Pushes when origin exists.
 */
export function enableAlbumProductionDeploys(root = process.cwd()) {
  const origin = git(root, ['remote', 'get-url', 'origin']);
  const kit = git(root, ['remote', 'get-url', 'kit']);
  const originRepo = origin.status === 0 ? repoPath(origin.stdout) : null;
  const kitRepo = kit.status === 0 ? repoPath(kit.stdout) : null;
  if (
    originRepo === KIT_REPO ||
    (originRepo !== null && kitRepo !== null && originRepo === kitRepo)
  ) {
    return { changed: false, pushed: false };
  }
  if (!writeAlbumVercelConfig(root)) {
    return { changed: false, pushed: false };
  }
  const add = git(root, ['add', '--', 'vercel.json']);
  if (add.status !== 0) {
    throw new Error(`Could not stage vercel.json.\n${add.stderr ?? ''}`.trim());
  }
  const commit = git(root, [
    '-c',
    'user.name=album-kit',
    '-c',
    'user.email=album-kit@users.noreply.github.com',
    'commit',
    '-m',
    'Enable production deploys from main.',
    '--',
    'vercel.json',
  ]);
  if (commit.status !== 0) {
    throw new Error(`Could not commit vercel.json.\n${commit.stderr ?? ''}`.trim());
  }
  if (originRepo === null) {
    return { changed: true, pushed: false };
  }
  const push = git(root, ['push', 'origin', 'HEAD']);
  if (push.status !== 0) {
    throw new Error(`Could not push production deploy settings.\n${push.stderr ?? ''}`.trim());
  }
  return { changed: true, pushed: true };
}
