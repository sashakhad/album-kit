#!/usr/bin/env node
// pnpm takes:upload <file...> [--force]
// Retags canonical takes and uploads them to Blob at takes/<filename>.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { BlobNotFoundError, head, list, put } from '@vercel/blob';
import { upload } from '@vercel/blob/client';
import NodeID3 from 'node-id3';

const CANONICAL_TAKE =
  /^(v\d+)-(\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)-p(\d{1,2})-take([a-z]{1,2})\.mp3$/;

loadEnvLocal();

const { files, force } = parseArgs(process.argv.slice(2));
if (files.length === 0) {
  console.error('Usage: pnpm takes:upload <file...> [--force]');
  process.exit(1);
}

const album = readAlbum();
const { takes, rejects } = checkFiles(files);
if (rejects.length > 0) {
  console.error('Nothing uploaded. Fix these files first:');
  for (const reject of rejects) {
    console.error(`  ${reject}`);
  }
  process.exit(1);
}

const token = process.env.BLOB_READ_WRITE_TOKEN;
const remote = token ? null : ownerUploadConnection();
if (!token && remote === null) {
  console.error(
    'No Blob token or owner upload connection. Run pnpm setup:site and keep .album-key, or use /intake.'
  );
  process.exit(1);
}

let conflicts;
try {
  conflicts = token ? await letterConflicts(takes) : [];
} catch (error) {
  console.error(
    `Couldn't check Blob for existing takes: ${error instanceof Error ? error.message : error}`
  );
  process.exit(1);
}
if (conflicts.length > 0) {
  console.error('Nothing uploaded. These letters are already taken:');
  for (const conflict of conflicts) {
    console.error(`  ${conflict}`);
  }
  process.exit(1);
}

const counts = { uploaded: 0, skipped: 0, failed: 0 };
let next = 0;

async function worker() {
  while (next < takes.length) {
    const take = takes[next];
    next += 1;
    if (take === undefined) {
      return;
    }
    try {
      const result = await uploadTake(take);
      counts[result] += 1;
      console.log(
        result === 'skipped'
          ? `skipped  ${take.filename} (already uploaded; pass --force to replace it)`
          : `uploaded ${take.filename}`
      );
    } catch (error) {
      counts.failed += 1;
      console.log(`failed   ${take.filename}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

await Promise.all(Array.from({ length: 4 }, () => worker()));
console.log(
  `Uploaded ${counts.uploaded}, skipped ${counts.skipped}, failed ${counts.failed} of ${takes.length}.`
);
process.exit(counts.failed > 0 ? 1 : 0);

async function uploadTake(take) {
  const pathname = `takes/${take.filename}`;
  if (token && !force && (await blobExists(pathname))) {
    return 'skipped';
  }

  try {
    if (token) {
      await put(pathname, retag(take), {
        access: process.env.BLOB_ACCESS === 'private' ? 'private' : 'public',
        addRandomSuffix: false,
        allowOverwrite: force,
        contentType: 'audio/mpeg',
        token,
      });
    } else {
      if (force) throw new Error('--force requires a Blob token and an owner review');
      await upload(pathname, retag(take), {
        access: process.env.BLOB_ACCESS === 'private' ? 'private' : 'public',
        contentType: 'audio/mpeg',
        handleUploadUrl: `${remote.siteUrl}/api/owner/upload`,
        headers: { Authorization: `Bearer ${remote.key}` },
      });
    }
    return 'uploaded';
  } catch (error) {
    if (!force && error instanceof Error && /already exists/i.test(error.message)) {
      return 'skipped';
    }
    throw error;
  }
}

function ownerUploadConnection() {
  try {
    const site = JSON.parse(readFileSync(path.join(process.cwd(), '.album-site.json'), 'utf8'));
    const key = readFileSync(path.join(process.cwd(), '.album-key'), 'utf8').trim();
    return typeof site.siteUrl === 'string' && site.siteUrl.startsWith('https://') && key.length > 0
      ? { siteUrl: site.siteUrl.replace(/\/$/, ''), key }
      : null;
  } catch {
    return null;
  }
}

async function blobExists(pathname) {
  try {
    await head(pathname, { token });
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return false;
    }
    throw error;
  }
}

function retag(take) {
  const original = readFileSync(take.file);
  const untagged = NodeID3.removeTagsFromBuffer(original) || original;
  const tags = {
    title: take.track.title,
    album: album.title,
    trackNumber: String(take.track.number),
  };
  if (typeof album.artist === 'string' && album.artist.length > 0) {
    tags.artist = album.artist;
  }
  return NodeID3.write(tags, untagged);
}

// Letters are never reused, so a second file for the same set, track and letter is refused.
async function letterConflicts(checked) {
  const existingByPrefix = new Map();
  const found = [];
  for (const take of checked) {
    const number = String(take.track.number).padStart(2, '0');
    const prefix = `takes/${take.set.id}-${number}-`;
    if (!existingByPrefix.has(prefix)) {
      existingByPrefix.set(prefix, await listFilenames(prefix));
    }
    const existing = existingByPrefix
      .get(prefix)
      .find(name => name !== take.filename && takeLetter(name) === take.letter);
    if (existing !== undefined) {
      found.push(
        `${take.file}: take ${take.letter} of track ${number} in set ${take.set.id} already exists as ${existing}. Letters are never reused, so give this file the next free letter.`
      );
    }
  }
  return found;
}

async function listFilenames(prefix) {
  const filenames = [];
  let cursor;
  do {
    const result = await list(cursor === undefined ? { prefix, token } : { prefix, cursor, token });
    for (const blob of result.blobs) {
      filenames.push(blob.pathname.slice('takes/'.length));
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor !== undefined);
  return filenames;
}

function takeLetter(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  return /-take([a-z]{1,2})(?:[-_]|$)/i.exec(base)?.[1]?.toUpperCase() ?? null;
}

function checkFiles(paths) {
  const checked = [];
  const problems = [];
  const letters = new Map();
  for (const file of paths) {
    const filename = path.basename(file);
    const match = CANONICAL_TAKE.exec(filename);
    if (match === null) {
      problems.push(`${file}: not a canonical take name, like v1-07-track-seven-p3-takee.mp3`);
      continue;
    }

    const [, setId, trackNumber, , , letter] = match;
    const set = album.sets.find(item => item.id === setId);
    const track = album.tracks.find(item => item.number === Number(trackNumber));
    if (set === undefined) {
      problems.push(`${file}: set ${setId} is not in album/album.json`);
      continue;
    }
    if (track === undefined) {
      problems.push(`${file}: track ${trackNumber} is not in album/album.json`);
      continue;
    }
    try {
      readFileSync(file, { flag: 'r' });
    } catch {
      problems.push(`${file}: file not found`);
      continue;
    }
    const key = `${setId}-${trackNumber}-${letter}`;
    const earlier = letters.get(key);
    if (earlier !== undefined && earlier !== filename) {
      problems.push(`${file}: uses the same set, track and letter as ${earlier}`);
      continue;
    }
    letters.set(key, filename);
    checked.push({ file, filename, set, track, letter: letter.toUpperCase() });
  }
  return { takes: checked, rejects: problems };
}

function parseArgs(argv) {
  const options = { files: [], force: false };
  for (const arg of argv) {
    if (arg === '--force') {
      options.force = true;
    } else {
      options.files.push(arg);
    }
  }
  return options;
}

function readAlbum() {
  try {
    const parsed = JSON.parse(
      readFileSync(path.join(process.cwd(), 'album', 'album.json'), 'utf8')
    );
    return {
      title: String(parsed.title ?? ''),
      artist: parsed.artist,
      sets: Array.isArray(parsed.sets) ? parsed.sets : [],
      tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
    };
  } catch (error) {
    console.error(`Can't read album/album.json: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

function loadEnvLocal() {
  try {
    const raw = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) {
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eq);
      let value = trimmed.slice(eq + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // vercel env pull writes .env.local; missing file is handled by the token check
  }
}
