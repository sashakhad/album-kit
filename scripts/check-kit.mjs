#!/usr/bin/env node
// Report commit identifiers; never infer code equality from file or skill counts.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', timeout: 15_000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

function readInstalledRevision() {
  try {
    const config = JSON.parse(readFileSync('.album-site.json', 'utf8'));
    if (/^[0-9a-f]{40}$/.test(config.kitRevision ?? '')) return config.kitRevision;
  } catch {
    // A kit checkout may not have a site yet.
  }
  const local = git(['rev-parse', '--verify', 'refs/remotes/kit/main']);
  return local !== null && /^[0-9a-f]{40}$/.test(local) ? local : null;
}

const installedRevision = readInstalledRevision();
const remoteUrl = git(['remote', 'get-url', 'kit']);
const remoteLine = remoteUrl === null ? null : git(['ls-remote', 'kit', 'refs/heads/main']);
const currentRevision = remoteLine?.split(/\s+/)[0] ?? null;
const verified =
  installedRevision !== null && currentRevision !== null && /^[0-9a-f]{40}$/.test(currentRevision);

console.log(
  JSON.stringify(
    {
      kitSource: remoteUrl,
      installedRevision,
      currentRevision: verified ? currentRevision : null,
      status: verified
        ? installedRevision === currentRevision
          ? 'current'
          : 'update-available'
        : 'unverified',
    },
    null,
    2
  )
);
