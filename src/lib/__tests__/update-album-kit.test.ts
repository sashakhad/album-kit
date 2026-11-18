// @vitest-environment node
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { updateAlbum } from '../../../scripts/update-album-kit.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'album-updater-'));
const kit = path.join(root, 'kit');
const album = path.join(root, 'owner');

function write(directory: string, file: string, value: string) {
  const target = path.join(directory, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, value);
}

function read(directory: string, file: string) {
  return readFileSync(path.join(directory, file), 'utf8');
}

function fixture() {
  write(kit, 'package.json', '{"name":"album-kit"}');
  write(kit, 'album/album.json', '{"title":"Untitled album","tracks":[]}');
  write(kit, 'src/app/page.tsx', 'new player');
  write(kit, 'next.config.ts', 'new build config');
  write(kit, '.cursor/skills/start-here/SKILL.md', 'new onboarding');
  write(album, 'album/album.json', '{"title":"Keep This Album","tracks":[]}');
  write(album, 'package.json', '{"name":"album-kit"}');
}

afterEach(() => rmSync(root, { recursive: true, force: true }));

it('updates kit code in an ordinary album directory and preserves the owner’s files', () => {
  fixture();
  const protectedFiles = [
    'album/album.json',
    'album/BRIEF.md',
    'album/audio/new.mp3',
    'album/tracks/01-hello.md',
    'album/artwork.png',
    '.vercel/project.json',
    '.env.production',
    '.album-key',
    '.album-site.json',
    '.album-onboarding.json',
    '.tmp/album-preview-ballot.json',
    'vercel.json',
    '.vercelignore',
    'README.md',
    '.github/workflows/sync-albums.yml',
    'scripts/sync-albums.mjs',
    'albums.json',
    'src/owner-only.ts',
  ];
  for (const file of protectedFiles.slice(1)) write(album, file, 'owner data');
  for (const file of protectedFiles.slice(1, protectedFiles.indexOf('README.md') + 1))
    write(kit, file, 'wrong source');
  const originals = protectedFiles.map(file => read(album, file));
  const excluded = [
    'node_modules/lib/lib.js',
    'src/generated/prisma/client.ts',
    'scripts/.tmp/key.mjs',
    'src/lib/secrets.pem',
    '.next/compiled.js',
    'diagnostics/file.ts',
    '.npmrc',
  ];
  for (const file of excluded) write(kit, file, 'do not copy');
  write(album, 'src/app/page.tsx', 'old player');
  updateAlbum(kit, album);
  updateAlbum(kit, album);
  expect(read(album, 'src/app/page.tsx')).toBe('new player');
  expect(read(album, 'next.config.ts')).toBe('new build config');
  expect(read(album, '.cursor/skills/start-here/SKILL.md')).toBe('new onboarding');
  expect(protectedFiles.map(file => read(album, file))).toEqual(originals);
  for (const file of excluded) expect(existsSync(path.join(album, file))).toBe(false);
  expect(existsSync(path.join(album, '.git'))).toBe(false);
});

it('rejects the fresh kit, overlapping folders, and a non-album destination', () => {
  fixture();
  expect(() => updateAlbum(kit, kit)).toThrow(/separate album/);
  expect(() => updateAlbum(kit, root)).toThrow(/separate album/);
  expect(() => updateAlbum(kit, path.join(kit, 'album'))).toThrow(/separate album/);
  expect(() => updateAlbum(album, kit)).toThrow(/fresh kit/);
  write(album, 'album/album.json', read(kit, 'album/album.json'));
  expect(() => updateAlbum(kit, album)).toThrow(/unused kit/);
  write(album, 'album/album.json', '{}');
  expect(() => updateAlbum(kit, album)).toThrow(/album manifest/);
});

it('validates destination links before writing and skips links in the source', () => {
  fixture();
  const outside = path.join(root, 'outside');
  write(outside, 'page.tsx', 'outside file');
  mkdirSync(path.join(album, 'src'));
  symlinkSync(outside, path.join(album, 'src/app'));
  write(album, 'package.json', 'unchanged');
  expect(() => updateAlbum(kit, album)).toThrow(/ordinary directory/);
  expect(read(album, 'package.json')).toBe('unchanged');
  expect(read(outside, 'page.tsx')).toBe('outside file');
  rmSync(path.join(album, 'src/app'));
  mkdirSync(path.join(album, 'src/app'));
  symlinkSync(path.join(outside, 'page.tsx'), path.join(album, 'src/app/page.tsx'));
  expect(() => updateAlbum(kit, album)).toThrow(/ordinary file/);
  rmSync(path.join(album, 'src/app/page.tsx'));
  linkSync(path.join(outside, 'page.tsx'), path.join(album, 'src/app/page.tsx'));
  symlinkSync(outside, path.join(kit, 'src/linked'));
  updateAlbum(kit, album);
  expect(existsSync(path.join(album, 'src/linked'))).toBe(false);
  expect(read(outside, 'page.tsx')).toBe('outside file');
  expect(read(album, 'src/app/page.tsx')).toBe('new player');
});

it('runs from the fresh kit’s script when invoked outside both directories', () => {
  fixture();
  const script = 'scripts/update-album-kit.mjs';
  write(kit, script, read(process.cwd(), script));
  const message = execFileSync(process.execPath, [path.join(kit, script), album], {
    cwd: root,
    env: { PATH: '', NODE_ENV: 'test' },
    encoding: 'utf8',
  });
  expect(message).toContain('Updated');
  expect(read(album, script)).toBe(read(kit, script));
});
