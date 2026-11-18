// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { albumVercelText, enableAlbumProductionDeploys } from '../../../scripts/album-vercel.mjs';

const directories: string[] = [];
const kitVercel = `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "git": {
    "deploymentEnabled": {
      "main": false
    }
  }
}
`;

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'album-vercel-'));
  directories.push(directory);
  return directory;
}

function write(root: string, file: string, contents: string): void {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function git(directory: string, args: string[]): void {
  execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
}

function initRepo(directory: string): void {
  git(directory, ['init', '-b', 'main']);
  git(directory, ['config', 'user.email', 'owner@example.com']);
  git(directory, ['config', 'user.name', 'Owner']);
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('album vercel config', () => {
  it('excludes local account details and unpublished takes from a CLI deployment', () => {
    const work = tempDir();
    initRepo(work);
    const ignore = readFileSync(path.join(process.cwd(), '.vercelignore'), 'utf8');
    write(work, '.gitignore', ignore);
    const localFiles = [
      '.album-key',
      '.env.local',
      '.album-onboarding.json',
      '.album-site.json',
      '.vercel/project.json',
      'local.pem',
      '.tmp/album-preview-ledger.json',
      '.tmp/album-preview-streams.json',
      '.tmp/album-preview-ballot.json',
      'diagnostics/album/local-catalog.json',
      'album/audio/take.mp3',
    ];
    const output = execFileSync(
      'git',
      ['check-ignore', '--no-index', '--', ...localFiles, 'album/album.json', 'src/app/page.tsx'],
      { cwd: work, encoding: 'utf8' }
    );
    expect(output.trim().split('\n')).toEqual(localFiles);
    expect(() =>
      execFileSync('git', ['check-ignore', '--no-index', '--', '.env.example'], {
        cwd: work,
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).toThrow();
  });

  it('keeps this kit from auto-deploying main and strips that switch for albums', () => {
    const kitFile = readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8');
    expect(JSON.parse(kitFile).git.deploymentEnabled.main).toBe(false);
    const album = JSON.parse(albumVercelText(kitFile)) as {
      framework: string;
      git?: { deploymentEnabled?: { main?: boolean } };
    };
    expect(album.framework).toBe('nextjs');
    expect(album.git?.deploymentEnabled?.main).toBeUndefined();
    expect(
      JSON.parse(readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')).git
        .deploymentEnabled.main
    ).toBe(false);
    expect(albumVercelText(albumVercelText(kitFile))).toBe(albumVercelText(kitFile));
  });

  it('does not rewrite vercel.json when origin is the kit', () => {
    const root = tempDir();
    const bare = path.join(root, 'kit.git');
    const work = path.join(root, 'work');
    mkdirSync(bare);
    mkdirSync(work);
    git(bare, ['init', '--bare']);
    initRepo(work);
    write(work, 'vercel.json', kitVercel);
    git(work, ['add', '-A']);
    git(work, ['commit', '-m', 'kit']);
    git(work, ['remote', 'add', 'origin', bare]);
    git(work, ['remote', 'add', 'kit', bare]);

    expect(enableAlbumProductionDeploys(work)).toEqual({ changed: false, pushed: false });
    expect(
      JSON.parse(readFileSync(path.join(work, 'vercel.json'), 'utf8')).git.deploymentEnabled.main
    ).toBe(false);
  });

  it('commits the album switch off and pushes it when origin is an album repo', () => {
    const root = tempDir();
    const bare = path.join(root, 'album.git');
    const work = path.join(root, 'work');
    mkdirSync(bare);
    mkdirSync(work);
    git(bare, ['init', '--bare']);
    initRepo(work);
    write(work, 'vercel.json', kitVercel);
    write(work, 'album/album.json', '{"title":"Shrimp Club"}');
    git(work, ['add', '-A']);
    git(work, ['commit', '-m', 'album']);
    git(work, ['remote', 'add', 'origin', bare]);
    git(work, ['remote', 'add', 'kit', 'https://github.com/sashakhad/album-kit.git']);
    git(work, ['push', '-u', 'origin', 'main']);

    expect(enableAlbumProductionDeploys(work)).toEqual({ changed: true, pushed: true });

    const checked = path.join(root, 'checked');
    execFileSync('git', ['clone', '--branch', 'main', bare, checked], { cwd: root, stdio: 'pipe' });
    const synced = JSON.parse(readFileSync(path.join(checked, 'vercel.json'), 'utf8')) as {
      framework: string;
      git?: unknown;
    };
    expect(synced.framework).toBe('nextjs');
    expect(synced.git).toBeUndefined();
    expect(readFileSync(path.join(checked, 'album/album.json'), 'utf8')).toContain('Shrimp Club');
  });

  it('commits the album switch locally before the first GitHub push', () => {
    const work = tempDir();
    initRepo(work);
    write(work, 'vercel.json', kitVercel);
    git(work, ['add', '-A']);
    git(work, ['commit', '-m', 'album']);
    git(work, ['remote', 'add', 'kit', 'https://github.com/sashakhad/album-kit.git']);

    expect(enableAlbumProductionDeploys(work)).toEqual({ changed: true, pushed: false });
    expect(JSON.parse(readFileSync(path.join(work, 'vercel.json'), 'utf8')).git).toBeUndefined();
    const remotes = execFileSync('git', ['remote'], { cwd: work, encoding: 'utf8' });
    expect(remotes).not.toContain('origin');
  });
});
