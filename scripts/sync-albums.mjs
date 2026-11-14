#!/usr/bin/env node
// Copies this kit into every repo listed in albums.json and pushes that branch.
// Album content is never overwritten: album/BRIEF.md, album/album.json, album/tracks/.
// A push to the album repo is what deploys it, through Vercel's Git integration.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', '.next', '.vercel', 'coverage']);
const SKIP_FILES = new Set(['.env', '.env.local', '.album-key', '.album-onboarding.json']);

export function isAlbumContent(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
  return (
    normalized === 'album/BRIEF.md' ||
    normalized === 'album/album.json' ||
    normalized === 'album/tracks' ||
    normalized.startsWith('album/tracks/')
  );
}

export function keepAlbumFile(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  return (
    isAlbumContent(normalized) ||
    normalized.startsWith('album/') ||
    normalized === '.album-site.json'
  );
}

export function listFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        walk(path.join(directory, entry.name));
        continue;
      }
      if (!entry.isFile() || SKIP_FILES.has(entry.name)) continue;
      files.push(path.relative(root, path.join(directory, entry.name)).split(path.sep).join('/'));
    }
  }
  walk(root);
  return files.sort();
}

export function planSync(kitFiles, albumFiles) {
  const kit = new Set(kitFiles);
  return {
    write: kitFiles.filter(file => !isAlbumContent(file)),
    remove: albumFiles.filter(file => !kit.has(file) && !keepAlbumFile(file)),
  };
}

export function applySync(kitRoot, albumRoot) {
  const plan = planSync(listFiles(kitRoot), listFiles(albumRoot));
  for (const file of plan.remove) {
    rmSync(path.join(albumRoot, file), { force: true });
  }
  for (const file of plan.write) {
    const destination = path.join(albumRoot, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(kitRoot, file), destination);
  }
  return plan;
}

export function readRegistry(text) {
  const parsed = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.albums)) {
    throw new Error('albums.json must be an object with an albums array.');
  }
  return parsed.albums.map(album => {
    if (typeof album?.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(album.repo)) {
      throw new Error('Each album needs "repo" as owner/name.');
    }
    const branch = album.branch === undefined ? 'main' : album.branch;
    if (typeof branch !== 'string' || !/^[\w./-]+$/.test(branch) || branch.includes('..')) {
      throw new Error(`Invalid branch for ${album.repo}.`);
    }
    return { repo: album.repo, branch };
  });
}

export function publishSync(run, { branch, message }) {
  run('git', ['add', '-A']);
  const quiet = run('git', ['diff', '--cached', '--quiet']);
  if (quiet.status === 0) return { pushed: false };
  must(run, 'git', ['commit', '-m', message]);
  must(run, 'git', ['push', 'origin', `HEAD:${branch}`]);
  return { pushed: true };
}

function must(run, command, args) {
  const result = run(command, args);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed.\n${result.stderr ?? ''}`.trim());
  }
  return result;
}

function git(directory, args, token) {
  const commandArgs =
    token === undefined ? args : ['-c', `http.extraheader=AUTHORIZATION: bearer ${token}`, ...args];
  console.log(`git ${args.join(' ')}`);
  return spawnSync('git', commandArgs, {
    cwd: directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runIn(directory, token) {
  return (command, args) => {
    const result =
      command === 'git'
        ? git(directory, args, token)
        : spawnSync(command, args, { cwd: directory, encoding: 'utf8' });
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  };
}

export function syncCheckout(directory, { branch, kitRoot, kitSha, token }) {
  const run = runIn(directory, token);
  must(run, 'git', ['config', 'user.name', 'album-kit sync']);
  must(run, 'git', [
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  ]);
  const plan = applySync(kitRoot, directory);
  const short = kitSha.slice(0, 7);
  const published = publishSync(run, { branch, message: `Sync album kit ${short}` });
  return { ...published, wrote: plan.write.length, removed: plan.remove.length };
}

export function syncRegisteredAlbums({
  registryPath = 'albums.json',
  kitRoot = process.cwd(),
  token = process.env.ALBUM_SYNC_TOKEN,
  kitSha = process.env.KIT_SHA ?? 'local',
  workRoot = tmpdir(),
} = {}) {
  const albums = readRegistry(readFileSync(path.join(kitRoot, registryPath), 'utf8'));
  if (albums.length === 0) {
    console.log('No albums registered. Nothing to sync.');
    return [];
  }
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(
      'ALBUM_SYNC_TOKEN is not set. It must be able to push to every repo in albums.json.'
    );
  }
  const results = [];
  for (const album of albums) {
    const directory = path.join(workRoot, `album-sync-${album.repo.replace('/', '-')}`);
    rmSync(directory, { recursive: true, force: true });
    const cloned = git(
      workRoot,
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        album.branch,
        `https://github.com/${album.repo}.git`,
        directory,
      ],
      token
    );
    if (cloned.status !== 0) {
      throw new Error(`Could not clone ${album.repo} (${album.branch}).\n${cloned.stderr}`.trim());
    }
    const result = syncCheckout(directory, { branch: album.branch, kitRoot, kitSha, token });
    console.log(
      result.pushed
        ? `Pushed ${album.repo}@${album.branch}. Vercel deploys that push.`
        : `${album.repo}@${album.branch} already matches the kit.`
    );
    results.push({ repo: album.repo, ...result });
    rmSync(directory, { recursive: true, force: true });
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    syncRegisteredAlbums();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
