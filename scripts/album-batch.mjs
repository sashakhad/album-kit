#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { slugifyTrackTitle } from '../src/lib/album/slug.ts';
import { publicStreamEntries } from '../src/lib/album/stream-url.ts';
import { readLiveProgress, shareHeard } from './live-progress.mjs';

export const completionQuestion = 'Your album is ready. What’s next?';
export const completionChoices = ['Share album', 'Add more tracks'];

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;

function requireId(value, label) {
  if (typeof value !== 'string' || !idPattern.test(value)) {
    throw new Error(`Expected a ${label} id.`);
  }
  return value;
}

function idList(value, label) {
  if (!Array.isArray(value)) throw new Error(`Expected ${label}.`);
  const ids = [];
  for (const item of value) {
    const id = requireId(item, label);
    if (ids.includes(id)) throw new Error(`Duplicate ${label} id.`);
    ids.push(id);
  }
  return ids;
}

function copyList(value, label) {
  const ids = idList(value, label);
  if (ids.length === 0) throw new Error(`Expected ${label}.`);
  return ids;
}

function sameList(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function trackList(album) {
  if (!album || !Array.isArray(album.tracks)) throw new Error('Expected album tracks.');
  return album.tracks;
}

function songsFor(album, numbers) {
  const songs = [];
  for (const number of numbers) {
    if (!Number.isInteger(number) || number < 1) throw new Error('Expected a track number.');
    const track = trackList(album).find(item => item.number === number);
    if (!track || typeof track.title !== 'string' || typeof track.slug !== 'string') {
      throw new Error(`Track ${number} is not on this album.`);
    }
    if (songs.some(item => item.number === number)) throw new Error('Duplicate track number.');
    songs.push({ number: track.number, title: track.title, slug: track.slug });
  }
  if (songs.length === 0) throw new Error('Expected album tracks.');
  return songs;
}

function normalizeOperation(value) {
  if (!value || typeof value !== 'object') throw new Error('The album ledger batch is invalid.');
  return {
    id: requireId(value.id, 'operation'),
    clipIds: Array.isArray(value.clipIds) ? idList(value.clipIds, 'clip') : [],
    failed: value.failed === true,
    waived: value.waived === true,
  };
}

function normalizeAdded(value) {
  if (!Array.isArray(value)) return [];
  const added = [];
  for (const track of value) {
    if (
      !track ||
      !Number.isInteger(track.number) ||
      typeof track.title !== 'string' ||
      typeof track.slug !== 'string'
    ) {
      throw new Error('The album ledger batch is invalid.');
    }
    added.push({ number: track.number, title: track.title, slug: track.slug });
  }
  return added;
}

function normalizeReply(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('The album ledger batch is invalid.');
  const choice = value.choice;
  if (!['share', 'add', 'later', 'custom'].includes(choice)) {
    throw new Error('The album ledger batch is invalid.');
  }
  return {
    choice,
    text: typeof value.text === 'string' ? value.text : null,
    titles: Array.isArray(value.titles) ? value.titles.map(title => String(title)) : [],
    added: normalizeAdded(value.added),
  };
}

function normalizeBatch(value) {
  if (!value || typeof value !== 'object') throw new Error('The album ledger batch is invalid.');
  if (value.kind !== 'songs' && value.kind !== 'more') {
    throw new Error('The album ledger batch is invalid.');
  }
  return {
    id: requireId(value.id, 'batch'),
    kind: value.kind,
    tracks: normalizeAdded(value.tracks),
    operations: Array.isArray(value.operations) ? value.operations.map(normalizeOperation) : [],
    offer: value.offer && typeof value.offer.at === 'string' ? { at: value.offer.at } : null,
    reply: normalizeReply(value.reply),
  };
}

export function readLedger(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { completion: { batches: [] } };
  }
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The album ledger must be a JSON object.');
  }
  const completion = value.completion ?? { batches: [] };
  if (!completion || !Array.isArray(completion.batches)) {
    throw new Error('The album ledger completion batches are invalid.');
  }
  return {
    ...value,
    completion: { ...completion, batches: completion.batches.map(normalizeBatch) },
  };
}

function withBatches(ledger, batches) {
  return { ...ledger, completion: { ...ledger.completion, batches } };
}

function replaceBatch(ledger, batch) {
  return withBatches(
    ledger,
    ledger.completion.batches.map(item => (item.id === batch.id ? batch : item))
  );
}

function playableClipIds(streams) {
  const ids = new Set();
  for (const entry of publicStreamEntries(streams ?? [])) ids.add(entry.clipId);
  return ids;
}

function operationState(operation, playable) {
  if (operation.waived) return 'waived';
  for (const clipId of operation.clipIds) {
    if (playable.has(clipId)) return 'playable';
  }
  if (operation.failed) return 'failed';
  return 'pending';
}

function batchIsOpen(batch, playable) {
  for (const operation of batch.operations) {
    const state = operationState(operation, playable);
    if (state === 'pending' || state === 'failed') return true;
  }
  return false;
}

function songPhase(batch, playable) {
  if (batchIsOpen(batch, playable)) return 'partial';
  if (!batch.offer) return 'ready';
  if (!batch.reply) return 'offered';
  return 'recorded';
}

function findBatch(ledger, batchId) {
  const batch = ledger.completion.batches.find(item => item.id === batchId);
  if (!batch) throw new Error('That batch is not in the album ledger.');
  return batch;
}

function activeSongs(ledger, playable) {
  const songs = ledger.completion.batches.filter(batch => batch.kind === 'songs');
  for (const phase of ['partial', 'ready', 'offered']) {
    const batch = songs.find(item => songPhase(item, playable) === phase);
    if (batch) return batch;
  }
  return songs.length > 0 ? songs[songs.length - 1] : null;
}

function pendingIds(batch, playable) {
  const ids = [];
  if (!batch) return ids;
  for (const operation of batch.operations) {
    const state = operationState(operation, playable);
    if (state === 'pending' || state === 'failed') ids.push(operation.id);
  }
  return ids;
}

function cardFor(phase) {
  if (phase !== 'ready') return null;
  return {
    question: completionQuestion,
    choices: [...completionChoices],
    allowCustom: true,
  };
}

export function completionStatus(ledger, streams, options = {}) {
  const playable = playableClipIds(streams);
  const batch = activeSongs(ledger, playable);
  const phase = batch ? songPhase(batch, playable) : 'empty';
  const more = ledger.completion.batches.find(
    item => item.kind === 'more' && batchIsOpen(item, playable)
  );
  const heard = options.heard === true;
  const ready = phase === 'ready';
  return {
    phase,
    hosting: phase === 'recorded' && batch?.reply?.choice === 'share',
    card: heard && ready ? cardFor(phase) : null,
    shareCard: heard && ready,
    batchId: batch?.id ?? null,
    pendingOperationIds: pendingIds(batch, playable),
    reply: batch?.reply ?? null,
    alreadyOffered: Boolean(batch?.offer),
    alternateTakes: more
      ? { batchId: more.id, pendingOperationIds: pendingIds(more, playable) }
      : null,
  };
}

function assertNoOpenSongs(ledger, exceptId) {
  for (const batch of ledger.completion.batches) {
    if (batch.kind === 'songs' && batch.id !== exceptId && !batch.reply) {
      throw new Error('Finish the open batch before starting another.');
    }
  }
}

export function openSongBatch(ledger, album, input) {
  const id = requireId(input.id, 'batch');
  const tracks = songsFor(album, input.trackNumbers);
  const operationIds = copyList(input.operationIds, 'operation');
  const existing = ledger.completion.batches.find(batch => batch.id === id);
  if (existing) {
    if (existing.kind !== 'songs') throw new Error('That batch is not a new-song batch.');
    const sameTracks = sameList(
      existing.tracks.map(track => String(track.number)),
      tracks.map(track => String(track.number))
    );
    const sameOperations = sameList(
      existing.operations.map(operation => operation.id),
      operationIds
    );
    if (!sameTracks || !sameOperations) {
      throw new Error('That batch is already recorded with different songs.');
    }
    return ledger;
  }
  assertNoOpenSongs(ledger, id);
  const batch = {
    id,
    kind: 'songs',
    tracks,
    operations: operationIds.map(operationId => ({
      id: operationId,
      clipIds: [],
      failed: false,
      waived: false,
    })),
    offer: null,
    reply: null,
  };
  return withBatches(ledger, [...ledger.completion.batches, batch]);
}

export function openAlternateBatch(ledger, album, input) {
  const id = requireId(input.id, 'batch');
  const tracks = songsFor(album, [input.trackNumber]);
  const operationIds = copyList(input.operationIds, 'operation');
  const existing = ledger.completion.batches.find(batch => batch.id === id);
  if (existing) {
    if (existing.kind !== 'more') {
      throw new Error(
        'Add more tracks appends new songs. /more makes alternate takes of an existing track.'
      );
    }
    return ledger;
  }
  const batch = {
    id,
    kind: 'more',
    tracks,
    operations: operationIds.map(operationId => ({
      id: operationId,
      clipIds: [],
      failed: false,
      waived: false,
    })),
    offer: null,
    reply: null,
  };
  return withBatches(ledger, [...ledger.completion.batches, batch]);
}

function updateOperation(ledger, batchId, operationId, update) {
  const batch = findBatch(ledger, batchId);
  let found = false;
  const operations = batch.operations.map(operation => {
    if (operation.id !== operationId) return operation;
    found = true;
    return update(operation);
  });
  if (!found) throw new Error('That operation is not in this batch.');
  return replaceBatch(ledger, { ...batch, operations });
}

export function noteClips(ledger, input) {
  const clipIds = copyList(input.clipIds, 'clip');
  return updateOperation(
    ledger,
    requireId(input.batchId, 'batch'),
    requireId(input.operationId, 'operation'),
    operation => {
      const next = [...operation.clipIds];
      for (const clipId of clipIds) {
        if (!next.includes(clipId)) next.push(clipId);
      }
      return { ...operation, clipIds: next };
    }
  );
}

export function failOperation(ledger, input) {
  return updateOperation(
    ledger,
    requireId(input.batchId, 'batch'),
    requireId(input.operationId, 'operation'),
    operation => ({ ...operation, failed: true })
  );
}

export function waiveRemaining(ledger, streams, batchId) {
  const playable = playableClipIds(streams);
  const batch = findBatch(ledger, requireId(batchId, 'batch'));
  let playableCount = 0;
  for (const operation of batch.operations) {
    if (operationState(operation, playable) === 'playable') playableCount += 1;
  }
  if (playableCount === 0) {
    throw new Error('Keep at least one playable take before finishing with fewer.');
  }
  const operations = batch.operations.map(operation => {
    const state = operationState(operation, playable);
    if (state === 'pending' || state === 'failed') return { ...operation, waived: true };
    return operation;
  });
  return replaceBatch(ledger, { ...batch, operations });
}

export function offerCard(ledger, streams, batchId) {
  const playable = playableClipIds(streams);
  const batch = findBatch(ledger, requireId(batchId, 'batch'));
  if (batch.kind !== 'songs') {
    throw new Error(
      'Add more tracks appends new songs. /more makes alternate takes of an existing track.'
    );
  }
  if (batchIsOpen(batch, playable)) throw new Error('A pending take keeps this batch open.');
  if (batch.offer) return ledger;
  return replaceBatch(ledger, { ...batch, offer: { at: new Date().toISOString() } });
}

function titlesOf(input) {
  if (!Array.isArray(input.titles) || input.titles.length === 0) {
    throw new Error('Add more tracks needs the new song titles.');
  }
  const titles = [];
  for (const value of input.titles) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('Add more tracks needs the new song titles.');
    }
    titles.push(value.trim());
  }
  return titles;
}

function planAdded(album, titles) {
  const usedSlugs = new Set(trackList(album).map(track => track.slug));
  let nextNumber = 0;
  for (const track of trackList(album)) {
    if (Number.isInteger(track.number) && track.number > nextNumber) nextNumber = track.number;
  }
  const added = [];
  for (const title of titles) {
    const slug = slugifyTrackTitle(title);
    if (slug.length === 0) throw new Error('Add more tracks needs the new song titles.');
    if (usedSlugs.has(slug)) {
      throw new Error('That title matches an existing track. Choose a distinct title.');
    }
    nextNumber += 1;
    usedSlugs.add(slug);
    added.push({ number: nextNumber, title, slug });
  }
  return added;
}

function sameReply(reply, choice, titles, text) {
  if (reply.choice !== choice) return false;
  if (choice === 'add') return sameList(reply.titles, titles);
  if (choice === 'custom') return reply.text === text;
  return true;
}

function installTracks(album, added) {
  const missing = [];
  for (const track of added) {
    const sameNumber = trackList(album).find(item => item.number === track.number);
    const sameSlug = trackList(album).find(item => item.slug === track.slug);
    if (sameNumber && sameSlug && sameNumber === sameSlug && sameNumber.title === track.title)
      continue;
    if (sameNumber || sameSlug) throw new Error('The album tracks no longer match this batch.');
    missing.push(track);
  }
  if (missing.length === 0) return { album, appended: [] };
  return {
    album: { ...album, tracks: [...trackList(album), ...missing] },
    appended: missing,
  };
}

export function replyToBatch(ledger, album, streams, input) {
  const playable = playableClipIds(streams);
  const batch = findBatch(ledger, requireId(input.batchId, 'batch'));
  const choice = input.choice;
  if (!['share', 'add', 'later', 'custom'].includes(choice)) {
    throw new Error('Expected a reply of share, add, later, or custom.');
  }
  if (choice === 'add' && batch.kind !== 'songs') {
    throw new Error(
      'Add more tracks appends new songs. /more makes alternate takes of an existing track.'
    );
  }
  if (batchIsOpen(batch, playable)) throw new Error('A pending take keeps this batch open.');
  if (!batch.offer) throw new Error('Offer the card before recording a reply.');
  const titles = choice === 'add' ? titlesOf(input) : [];
  const text = choice === 'custom' ? (input.text ?? '') : null;
  if (choice === 'custom' && text.trim().length === 0) {
    throw new Error('A custom reply needs the creator’s text.');
  }
  if (choice === 'custom' && /^\s*yes\s*$/i.test(text)) {
    throw new Error('A bare yes needs one short clarification.');
  }
  if (batch.reply) {
    if (!sameReply(batch.reply, choice, titles, text)) {
      throw new Error('This batch already has a reply.');
    }
    const repaired =
      choice === 'add' ? installTracks(album, batch.reply.added) : { album, appended: [] };
    return { ledger, album: repaired.album, appended: repaired.appended };
  }
  const added = choice === 'add' ? planAdded(album, titles) : [];
  const reply = { choice, text, titles, added };
  const nextLedger = replaceBatch(ledger, { ...batch, reply });
  const installed = installTracks(album, added);
  return { ledger: nextLedger, album: installed.album, appended: installed.appended };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const pending = `${file}.${process.pid}.new`;
  await writeFile(pending, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(pending, file);
}

function paths(root) {
  return {
    album: path.join(root, 'album', 'album.json'),
    ledger: path.join(root, '.tmp', 'album-preview-ledger.json'),
    streams: path.join(root, '.tmp', 'album-preview-streams.json'),
  };
}

async function load(root) {
  const file = paths(root);
  const album = await readJson(file.album, null);
  if (!album) throw new Error('Expected album tracks.');
  const ledger = readLedger(await readJson(file.ledger, {}));
  let streams = [];
  try {
    streams = await readJson(file.streams, []);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { file, album, ledger, streams };
}

function numbers(values) {
  return (values ?? []).map(value => {
    if (!/^[1-9][0-9]*$/.test(value)) throw new Error('Expected a track number.');
    return Number(value);
  });
}

const SHARE_WAITS =
  'The share card waits for the owner’s next message after the album page. Do not show it with the file.';

async function run(root, command, values) {
  const state = await load(root);
  const heard = shareHeard(await readLiveProgress(root));
  if (command === 'status') return completionStatus(state.ledger, state.streams, { heard });
  if (command === 'open') {
    const ledger = openSongBatch(state.ledger, state.album, {
      id: values.id,
      trackNumbers: numbers(values.track),
      operationIds: values.operation,
    });
    await writeJson(state.file.ledger, ledger);
    return completionStatus(ledger, state.streams, { heard });
  }
  if (command === 'more') {
    const [trackNumber] = numbers(values.track);
    if (values.track?.length !== 1) throw new Error('Expected one existing track for /more.');
    const ledger = openAlternateBatch(state.ledger, state.album, {
      id: values.id,
      trackNumber,
      operationIds: values.operation,
    });
    await writeJson(state.file.ledger, ledger);
    return completionStatus(ledger, state.streams, { heard });
  }
  if (command === 'clips') {
    if (values.operation?.length !== 1) throw new Error('Expected one operation id.');
    const ledger = noteClips(state.ledger, {
      batchId: values.id,
      operationId: values.operation[0],
      clipIds: values.clip,
    });
    await writeJson(state.file.ledger, ledger);
    return completionStatus(ledger, state.streams, { heard });
  }
  if (command === 'fail') {
    if (values.operation?.length !== 1) throw new Error('Expected one operation id.');
    const ledger = failOperation(state.ledger, {
      batchId: values.id,
      operationId: values.operation[0],
    });
    await writeJson(state.file.ledger, ledger);
    return completionStatus(ledger, state.streams, { heard });
  }
  if (command === 'waive') {
    const ledger = waiveRemaining(state.ledger, state.streams, values.id);
    await writeJson(state.file.ledger, ledger);
    return completionStatus(ledger, state.streams, { heard });
  }
  const batchId = values.id ?? completionStatus(state.ledger, state.streams, { heard }).batchId;
  if (command === 'offer') {
    if (!heard) throw new Error(SHARE_WAITS);
    const ledger = offerCard(state.ledger, state.streams, batchId);
    await writeJson(state.file.ledger, ledger);
    return completionStatus(ledger, state.streams, { heard });
  }
  if (command === 'reply') {
    const result = replyToBatch(state.ledger, state.album, state.streams, {
      batchId,
      choice: values.choice,
      titles: values.title,
      text: values.text,
    });
    await writeJson(state.file.ledger, result.ledger);
    if (result.appended.length > 0) await writeJson(state.file.album, result.album);
    return completionStatus(result.ledger, state.streams, { heard });
  }
  throw new Error(
    'Usage: node scripts/album-batch.mjs <status|open|more|clips|fail|waive|offer|reply>'
  );
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values, positionals } = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options: {
        id: { type: 'string' },
        track: { type: 'string', multiple: true },
        operation: { type: 'string', multiple: true },
        clip: { type: 'string', multiple: true },
        choice: { type: 'string' },
        title: { type: 'string', multiple: true },
        text: { type: 'string' },
      },
    });
    console.log(JSON.stringify(await run(process.cwd(), positionals[0], values)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
