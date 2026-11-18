#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The update is an overlay of the parts that run the kit. Everything outside
// this list belongs to the album, including its Vercel and environment files.
const rootFiles = new Set([
  'AGENTS.md',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.node-version',
  '.nvmrc',
  'tsconfig.json',
  'next.config.ts',
  'postcss.config.mjs',
  'prisma.config.ts',
  'components.json',
  'vitest.config.ts',
  'vitest.setup.ts',
  'eslint.config.mjs',
]);
const trees = new Map([
  ['.cursor', /^(?:commands\/[^/]+\.md|rules\/[^/]+\.mdc|skills\/[^/]+\/SKILL\.md)$/],
  ['grokbot', /^(?:BOT|PORTABLE)\.md$/],
  ['prisma', /^(?:schema\.prisma|migrations\/(?:migration_lock\.toml|[^/]+\/migration\.sql))$/],
  ['public', /^next\.svg$/],
  ['scripts', /^[^/]+\.(?:mjs|html)$/],
  ['src', /\.(?:ts|tsx|css)$|^app\/favicon\.ico$/],
]);
const skipDirectories = new Set(['node_modules', 'generated', 'dist', 'build', 'out', 'coverage']);

// Only the original release bytes are retired. A modified workflow or script
// is the owner's file. An existing registry is the owner's data too.
const retired = {
  '.github/workflows/sync-albums.yml': [
    '4f002cf3280c7efb37f727f0a36ea1f4eab0488c28e60303245ca0b64c34eed6',
  ],
  'scripts/sync-albums.mjs': [
    '9a96ad3adda1c66428757b54ea07de33dcc3395c067da62496a27297ef93ec59',
    'bd3bcd274039c25353ab19b3872655ccc2115ac07dff37d5a5c6a8d65160c867',
  ],
  'src/lib/__tests__/sync-albums.test.ts': [
    'c2e31a86a61c949b61fd7577818b7c6ec48353ec457d5f04ca95810eff959ce8',
    'a1076ea4d8a83f6119032bb80a1049a77a4ed3f93c9133ee9d81194e82353faa',
  ],
};

function inventory(root) {
  const files = [];
  function walk(relative, tree = '', prefix = '') {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = path.join(relative, entry.name);
      if (!tree) {
        if (entry.isFile() && rootFiles.has(entry.name)) files.push(file);
        if (entry.isDirectory() && trees.has(entry.name)) walk(file, entry.name);
        continue;
      }
      if (entry.name.startsWith('.') || skipDirectories.has(entry.name)) continue;
      const child = prefix + entry.name;
      if (entry.isDirectory()) walk(file, tree, child + '/');
      if (entry.isFile() && trees.get(tree).test(child)) files.push(file);
    }
  }
  walk('');
  return files;
}

// Validate existing parents too. Checking just the final file would let a
// symlinked directory redirect an update outside the album.
function checkPath(root, relative, skipObstruction = false) {
  const parts = relative.split(path.sep);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const info = lstatSync(current, { throwIfNoEntry: false });
    if (!info) return false;
    if (index === parts.length - 1 ? !info.isFile() : !info.isDirectory()) {
      if (skipObstruction) return false;
      throw new Error(
        `Expected an ordinary ${index === parts.length - 1 ? 'file' : 'directory'}: ${current}`
      );
    }
  }
  return true;
}

function readAlbum(root) {
  const relative = path.join('album', 'album.json');
  checkPath(root, relative);
  const data = JSON.parse(readFileSync(path.join(root, relative), 'utf8'));
  if (typeof data?.title !== 'string' || !data.title.trim() || !Array.isArray(data.tracks)) {
    throw new Error(`Expected an album manifest in ${root}.`);
  }
  return data;
}

export function updateAlbum(kitDirectory, albumDirectory) {
  const kit = realpathSync(kitDirectory);
  if (!lstatSync(albumDirectory).isDirectory())
    throw new Error('Choose the album directory itself.');
  const album = realpathSync(albumDirectory);
  if (
    kit === album ||
    album.startsWith(path.join(kit, path.sep)) ||
    kit.startsWith(path.join(album, path.sep))
  ) {
    throw new Error('Choose a separate album folder outside the fresh kit.');
  }
  const template = readAlbum(kit);
  const target = readAlbum(album);
  checkPath(kit, 'package.json');
  const sourcePackage = JSON.parse(readFileSync(path.join(kit, 'package.json'), 'utf8'));
  if (
    sourcePackage.name !== 'album-kit' ||
    template.title !== 'Untitled album' ||
    template.tracks.length
  ) {
    throw new Error('Run the update script from a fresh kit.');
  }
  if (target.title === template.title && !target.tracks.length) {
    throw new Error('Choose an existing album. This destination is an unused kit.');
  }
  const files = inventory(kit);
  for (const file of files) checkPath(album, file);
  const staging = mkdtempSync(path.join(album, '.kit-update-'));
  try {
    for (const file of files) {
      const pending = path.join(staging, file);
      mkdirSync(path.dirname(pending), { recursive: true });
      copyFileSync(path.join(kit, file), pending);
    }
    for (const file of files) {
      const destination = path.join(album, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      renameSync(path.join(staging, file), destination);
    }
    for (const [file, hashes] of Object.entries(retired)) {
      if (!checkPath(album, path.normalize(file), true)) continue;
      const destination = path.join(album, file);
      const digest = createHash('sha256').update(readFileSync(destination)).digest('hex');
      if (hashes.includes(digest)) rmSync(destination);
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return files.length;
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 3 || process.argv[2].startsWith('-')) {
      throw new Error('Usage: node scripts/update-album-kit.mjs <album-directory>');
    }
    const kit = fileURLToPath(new URL('../', import.meta.url));
    const count = updateAlbum(kit, process.argv[2]);
    console.log(`Updated ${count} kit files in ${realpathSync(process.argv[2])}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
