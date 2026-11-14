// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  applySync,
  isAlbumContent,
  planSync,
  publishSync,
  readRegistry,
} from '../../../scripts/sync-albums.mjs';

const directories: string[] = [];

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'album-sync-'));
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

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('album content guard', () => {
  it('refuses to replace the brief, album.json, and track sheets', () => {
    expect(isAlbumContent('album/BRIEF.md')).toBe(true);
    expect(isAlbumContent('album/album.json')).toBe(true);
    expect(isAlbumContent('album/tracks/one.md')).toBe(true);
    expect(isAlbumContent('album/audio/song.mp3')).toBe(false);
    expect(isAlbumContent('src/app/page.tsx')).toBe(false);
  });

  it('plans writes around album content and keeps album-only files', () => {
    const plan = planSync(
      [
        'README.md',
        'album/album.json',
        'album/BRIEF.md',
        'album/tracks/one.md',
        'src/app/page.tsx',
      ],
      [
        'README.md',
        'album/album.json',
        'album/BRIEF.md',
        'album/tracks/one.md',
        'album/tracks/two.md',
        'album/audio/song.mp3',
        '.album-site.json',
        'old-file.js',
      ]
    );

    expect(plan.write).toEqual(['README.md', 'src/app/page.tsx']);
    expect(plan.remove).toEqual(['old-file.js']);
  });

  it('copies kit code and leaves the album files byte for byte', () => {
    const kit = tempDir();
    const album = tempDir();
    write(kit, 'src/app/page.tsx', 'kit page');
    write(kit, 'album/album.json', '{"title":"Template"}');
    write(kit, 'album/BRIEF.md', 'template brief');
    write(kit, 'album/tracks/one.md', 'template sheet');
    write(album, 'src/app/page.tsx', 'old page');
    write(album, 'album/album.json', '{"title":"Shrimp Club"}');
    write(album, 'album/BRIEF.md', 'owner brief');
    write(album, 'album/tracks/one.md', 'owner sheet');
    write(album, 'album/tracks/two.md', 'second sheet');
    write(album, 'album/audio/song.mp3', 'audio');
    write(album, '.album-site.json', '{"siteUrl":"https://album.example"}');
    write(album, 'old-file.js', 'stale');

    applySync(kit, album);

    expect(readFileSync(path.join(album, 'src/app/page.tsx'), 'utf8')).toBe('kit page');
    expect(readFileSync(path.join(album, 'album/album.json'), 'utf8')).toBe(
      '{"title":"Shrimp Club"}'
    );
    expect(readFileSync(path.join(album, 'album/BRIEF.md'), 'utf8')).toBe('owner brief');
    expect(readFileSync(path.join(album, 'album/tracks/one.md'), 'utf8')).toBe('owner sheet');
    expect(readFileSync(path.join(album, 'album/tracks/two.md'), 'utf8')).toBe('second sheet');
    expect(readFileSync(path.join(album, 'album/audio/song.mp3'), 'utf8')).toBe('audio');
    expect(readFileSync(path.join(album, '.album-site.json'), 'utf8')).toContain('album.example');
    expect(() => readFileSync(path.join(album, 'old-file.js'), 'utf8')).toThrow();
  });
});

describe('albums.json', () => {
  it('reads an empty registry and defaults the branch to main', () => {
    expect(readRegistry('{"albums":[]}')).toEqual([]);
    expect(readRegistry('{"albums":[{"repo":"owner/shrimp-clvb"}]}')).toEqual([
      { repo: 'owner/shrimp-clvb', branch: 'main' },
    ]);
  });

  it('rejects a registry that is not a list of owner/name repos', () => {
    expect(() => readRegistry('{"albums":[{"repo":"https://github.com/owner/name"}]}')).toThrow(
      /owner\/name/
    );
    expect(() => readRegistry('[]')).toThrow(/albums array/);
  });
});

describe('publishSync', () => {
  it('does not push when the kit already matches', () => {
    const calls: string[] = [];
    const result = publishSync(
      (_command: string, args: string[]) => {
        calls.push(args.join(' '));
        return { status: args[0] === 'diff' ? 0 : 0, stdout: '', stderr: '' };
      },
      { branch: 'main', message: 'Sync album kit abc1234' }
    );

    expect(result).toEqual({ pushed: false });
    expect(calls).toEqual(['add -A', 'diff --cached --quiet']);
  });

  it('commits and pushes without putting a token in the command', () => {
    const calls: string[] = [];
    const result = publishSync(
      (_command: string, args: string[]) => {
        calls.push(args.join(' '));
        return { status: args[0] === 'diff' ? 1 : 0, stdout: '', stderr: '' };
      },
      { branch: 'main', message: 'Sync album kit abc1234' }
    );

    expect(result).toEqual({ pushed: true });
    expect(calls.at(-1)).toBe('push origin HEAD:main');
    expect(calls.join('\n')).not.toMatch(/token|bearer|authorization/i);
  });
});

describe('local git sync', () => {
  it('pushes the kit and leaves the album repository content', () => {
    const root = tempDir();
    const bare = path.join(root, 'bare.git');
    const work = path.join(root, 'work');
    const kit = path.join(root, 'kit');
    mkdirSync(bare);
    mkdirSync(work);
    mkdirSync(kit);
    git(bare, ['init', '--bare']);
    git(work, ['init', '-b', 'main']);
    git(work, ['config', 'user.email', 'owner@example.com']);
    git(work, ['config', 'user.name', 'Owner']);
    write(work, 'README.md', 'old');
    write(work, 'album/album.json', '{"title":"Shrimp Club"}');
    write(work, 'album/BRIEF.md', 'owner brief');
    write(work, 'album/tracks/one.md', 'owner sheet');
    git(work, ['add', '-A']);
    git(work, ['commit', '-m', 'album']);
    git(work, ['remote', 'add', 'origin', bare]);
    git(work, ['push', '-u', 'origin', 'main']);
    write(kit, 'README.md', 'kit readme');
    write(kit, 'album/album.json', '{"title":"Template"}');
    write(kit, 'album/tracks/one.md', 'template sheet');

    applySync(kit, work);
    git(work, ['add', '-A']);
    git(work, ['commit', '-m', 'Sync album kit abc1234']);
    git(work, ['push', 'origin', 'HEAD:main']);

    const checked = path.join(root, 'checked');
    execFileSync('git', ['clone', '--branch', 'main', bare, checked], { cwd: root, stdio: 'pipe' });
    expect(readFileSync(path.join(checked, 'README.md'), 'utf8')).toBe('kit readme');
    expect(readFileSync(path.join(checked, 'album/album.json'), 'utf8')).toBe(
      '{"title":"Shrimp Club"}'
    );
    expect(readFileSync(path.join(checked, 'album/tracks/one.md'), 'utf8')).toBe('owner sheet');
  });
});
