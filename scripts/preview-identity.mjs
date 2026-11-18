import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function optionalText(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Releases before append support keyed ballots by the entire ordered track list.
function legacyKey(title, tracks) {
  return createHash('sha256').update(JSON.stringify({ title, tracks })).digest('hex').slice(0, 16);
}

function oldMetadata(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function recordedKey(file) {
  const key = await optionalText(file);
  return typeof key === 'string' &&
    /^(?:[a-f0-9]{16}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(key)
    ? key
    : null;
}

async function oldExportKeys(directory) {
  const [catalog, ballots, standalone, bundled] = await Promise.all([
    optionalText(path.join(directory, 'album-preview-catalog.json')),
    optionalText(path.join(directory, 'album-preview-ballot.json')),
    optionalText(path.join(directory, 'album-preview-online', 'Open Album.html')),
    optionalText(path.join(directory, 'album-preview', 'Open Album.html')),
  ]);
  return new Set([
    oldMetadata(catalog)?.albumKey,
    ...Object.keys(oldMetadata(ballots)?.albums ?? {}),
    ...[standalone, bundled].map(
      html => /const albumKey\s*=\s*"([0-9a-f]{16})";/.exec(html ?? '')?.[1]
    ),
  ]);
}

export async function previewIdentity(root, album) {
  const tracks = album.tracks.map(track => [track.number, track.slug]);
  const current = legacyKey(album.title, tracks);
  const directory = path.join(root, '.tmp');
  const records = path.join(directory, 'album-preview-identities');
  const file = path.join(records, current);
  const saved = await recordedKey(file);
  if (saved) return { albumKey: saved, legacyAlbumKey: current };

  const prefixes = tracks.map((_, i) => legacyKey(album.title, tracks.slice(0, i + 1))).reverse();
  if (!prefixes.length) prefixes.push(current);
  const previous = await Promise.all(
    prefixes.slice(1).map(key => recordedKey(path.join(records, key)))
  );
  let albumKey = previous.find(Boolean);
  if (!albumKey) {
    const evidence = await oldExportKeys(directory);
    albumKey = prefixes.find(key => evidence.has(key)) ?? randomUUID();
  }

  // A refresh, ZIP and public export can start together. Publish one complete
  // record and use the same winner for all three, even on the first export.
  await mkdir(records, { recursive: true });
  const pending = path.join(records, randomUUID() + '.pending');
  await writeFile(pending, albumKey, { mode: 0o600, flag: 'wx' });
  try {
    await link(pending, file);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  } finally {
    await unlink(pending);
  }
  const recorded = await recordedKey(file);
  if (!recorded) throw new Error('The saved album preview identifier is invalid.');
  return { albumKey: recorded, legacyAlbumKey: current };
}
