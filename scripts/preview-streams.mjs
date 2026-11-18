import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';

import { parseCanonicalTake } from '../src/lib/album/parse-filename.ts';
import { isPlayableStream } from '../src/lib/album/stream-url.ts';

export async function readJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw error;
  }
}

export async function saveJson(filename, value) {
  const pending = filename + '.' + randomUUID() + '.pending';
  try {
    await writeFile(pending, JSON.stringify(value) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(pending, filename);
  } finally {
    await rm(pending, { force: true });
  }
}

// Node's built-in SQLite supplies a cross-process writer lock. No tables or
// service are needed, and a process exit releases the lock without stale files.
export async function withPreviewWriter(root, lane, action) {
  const directory = path.join(root, '.tmp');
  await mkdir(directory, { recursive: true });
  const lock = new DatabaseSync(path.join(directory, `album-preview-${lane}.sqlite`));
  try {
    for (;;) {
      try {
        lock.exec('BEGIN IMMEDIATE');
        break;
      } catch (error) {
        if (error.errcode !== 5) throw error; // SQLITE_BUSY: another export is finishing.
        await delay(20);
      }
    }
    return await action();
  } finally {
    lock.close();
  }
}

export function mergeReadyTakes(existing, receipt, album) {
  if (!Array.isArray(existing)) throw new Error('The preview stream catalog must be a JSON array.');
  const entries = Array.isArray(receipt) ? receipt : [receipt];
  if (!entries.length) throw new Error('The receipt contains no ready takes.');
  const next = [...existing];
  for (const row of entries) {
    const parsed = typeof row?.filename === 'string' ? parseCanonicalTake(row.filename) : null;
    if (
      !parsed ||
      !album.sets.some(set => set.id === parsed.setId) ||
      !album.tracks.some(
        track => !track.parked && track.number === parsed.trackNumber && track.slug === parsed.slug
      )
    ) {
      throw new Error('The receipt must name a canonical take on an active album track.');
    }
    if (
      typeof row.clipId !== 'string' ||
      typeof row.streamUrl !== 'string' ||
      !isPlayableStream(row.streamUrl, row.clipId)
    ) {
      throw new Error(`The public Suno stream does not match the clip ID for ${row.filename}.`);
    }
    if (next.some(saved => saved?.clipId === row.clipId && saved.filename !== row.filename)) {
      throw new Error(`The clip for ${row.filename} was already recorded under a different take.`);
    }
    let found = false;
    for (let index = 0; index < next.length; index++) {
      const saved = next[index];
      if (saved?.filename !== row.filename) continue;
      for (const key of Object.keys(row)) {
        if (Object.hasOwn(saved, key) && !isDeepStrictEqual(saved[key], row[key])) {
          throw new Error(`Conflicting ${key} for recorded take ${row.filename}.`);
        }
      }
      next[index] = { ...saved, ...row };
      found = true;
    }
    if (!found) next.push(row);
  }
  return next;
}

export async function readStreams(root) {
  const absent = Symbol('absent');
  const catalog = await readJson(path.join(root, '.tmp', 'album-preview-streams.json'), absent);
  return catalog === absent ? readJson(path.join(root, 'album/public-streams.json'), []) : catalog;
}
