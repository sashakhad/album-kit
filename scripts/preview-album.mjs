#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCanonicalTake } from '../src/lib/album/parse-filename.ts';
import { isPlayableStream, isVideoStream } from '../src/lib/album/stream-url.ts';

import { servePreview } from './preview-server.mjs';
import { previewIdentity } from './preview-identity.mjs';

import {
  mergeReadyTakes,
  readJson,
  readStreams,
  saveJson,
  withPreviewWriter,
} from './preview-streams.mjs';

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]
  );
}

function takeLabel(number) {
  return number <= 26
    ? String.fromCharCode(64 + number)
    : takeLabel(Math.floor((number - 1) / 26)) + takeLabel(((number - 1) % 26) + 1);
}

async function priorLabels(root, albumKey) {
  const labels = new Map();
  for (const directory of ['album-preview', 'album-preview-online']) {
    const html = await readFile(
      path.join(root, '.tmp', directory, 'Open Album.html'),
      'utf8'
    ).catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    if (!html.includes(`const albumKey = "${albumKey}";`)) continue;
    for (const [button] of html.matchAll(/<button\b[^>]*>/g)) {
      const id = / data-id="([a-f0-9]{24})"/.exec(button)?.[1];
      const letter = / data-label="Take ([A-Z]+)"/.exec(button)?.[1];
      if (id && letter && !labels.has(id)) labels.set(id, letter);
    }
  }
  return labels;
}

async function assignLabels(root, albumKey, tracks) {
  const file = path.join(root, '.tmp', 'album-preview-labels', albumKey + '.json');
  const saved = await readJson(file, null);
  const prior = saved === null ? await priorLabels(root, albumKey) : new Map();
  const catalog = saved ?? {};
  let changed = false;
  for (const track of tracks) {
    const labels = catalog[track.number] ?? {};
    const used = new Set(Object.values(labels));
    // Older exports numbered only the takes that were present. Retain their
    // displayed letters before assigning any newly arrived clips.
    for (const take of track.takes) {
      const previous = prior.get(take.id);
      if (!Object.hasOwn(labels, take.id) && previous && !used.has(previous)) {
        labels[take.id] = previous;
        used.add(previous);
        changed = true;
      }
    }
    let next = 1;
    for (const take of track.takes) {
      if (Object.hasOwn(labels, take.id)) {
        if (typeof labels[take.id] !== 'string' || !/^[A-Z]+$/.test(labels[take.id])) {
          throw new Error('The saved preview take label is invalid.');
        }
      } else {
        let letter = take.letter;
        while (used.has(letter)) letter = takeLabel(next++);
        labels[take.id] = letter;
        used.add(letter);
        changed = true;
      }
      take.letter = labels[take.id];
    }
    catalog[track.number] = labels;
  }
  if (changed) {
    await mkdir(path.dirname(file), { recursive: true });
    await saveJson(file, catalog);
  }
}

async function renderPreview(album, tracks, albumKey, legacyAlbumKey) {
  const [template, styles] = await Promise.all([
    readFile(new URL('./album-preview.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8'),
  ]);
  const theme = /^\.dark \{[^}]+\}/m.exec(styles)?.[0];
  if (!theme) throw new Error('The app’s dark theme is missing.');

  const sections = tracks
    .map(track => {
      const title = escapeHtml(track.title);
      const number = String(track.number).padStart(2, '0');
      const takes = track.takes
        .map(take => {
          const label = `Take ${take.letter}`;
          const name = `${title}, ${label}`;
          return `<div class="take-row" data-take-id="${take.id}" role="group" aria-label="${name}">
            <button type="button" data-take aria-label="${name}" aria-pressed="false"
              data-src="${escapeHtml(take.src)}" data-id="${take.id}" data-title="${title}" data-label="${label}"
              data-online="${take.online}" data-kind="${isVideoStream(take.src) ? 'video' : 'audio'}">${take.letter}</button>
            <button type="button" data-delta="-1" disabled aria-label="Lower score for ${name}">−</button>
            <output class="take-score" aria-label="Score for ${name}">0</output>
            <button type="button" data-delta="1" disabled aria-label="Raise score for ${name}">+</button>
          </div>`;
        })
        .join('');
      return `<section class="track"><h2><span class="track-number">${number}</span>${title}</h2>
      ${takes ? `<div class="takes">${takes}</div><p class="muted" data-pass-empty hidden>No takes left in this pass.</p>` : '<p class="muted">No takes ready yet.</p>'}</section>`;
    })
    .join('');

  const replacements = {
    title: escapeHtml(album.title),
    artist: album.artist ? `<p class="artist">${escapeHtml(album.artist)}</p>` : '',
    tracks: sections || '<p class="muted">No tracks yet.</p>',
    theme,
    albumKey: JSON.stringify(albumKey),
    legacyAlbumKey: JSON.stringify(legacyAlbumKey),
  };
  return template.replace(
    /\{\{(title|artist|tracks|theme|albumKey|legacyAlbumKey)\}\}/g,
    (_, key) => replacements[key]
  );
}

async function exportPreview(
  root,
  {
    makeZip = false,
    serve = false,
    streamsOnly = false,
    output = path.join(root, '.tmp', streamsOnly ? 'album-preview-online' : 'album-preview'),
  } = {}
) {
  const startedAt = performance.now();
  const albumRoot = path.join(root, 'album');
  const audioRoot = path.join(albumRoot, 'audio');
  const album = await readJson(path.join(albumRoot, 'album.json'));
  const { albumKey, legacyAlbumKey } = await previewIdentity(root, album);
  const streams = await readStreams(root);
  if (!Array.isArray(streams)) throw new Error('The preview stream catalog must be a JSON array.');

  const inputs = new Map();
  for (const row of streams) {
    if (
      typeof row?.filename === 'string' &&
      typeof row.streamUrl === 'string' &&
      isPlayableStream(row.streamUrl, row.clipId)
    ) {
      inputs.set(row.filename, { src: row.streamUrl, online: true });
    }
  }
  if (!streamsOnly) {
    const localFiles = await readdir(audioRoot, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of localFiles) {
      if (entry.isFile()) inputs.set(entry.name, { online: false });
    }
  }

  const sets = new Set(album.sets.map(set => set.id));
  const tracks = album.tracks
    .filter(track => !track.parked)
    .sort((left, right) => left.number - right.number)
    .map(track => ({ ...track, takes: [] }));
  const trackByNumber = new Map(tracks.map(track => [track.number, track]));
  const files = ['Open Album.html'];
  const parent = path.dirname(output);
  await mkdir(output, { recursive: true });
  const staging = await mkdtemp(path.join(parent, 'preview-'));
  const names = new Map();
  let offline = 0;
  let online = 0;
  try {
    for (const [filename, take] of [...inputs].sort(([left], [right]) =>
      left.localeCompare(right, 'en', { numeric: true })
    )) {
      const parsed = parseCanonicalTake(filename);
      if (!parsed || !sets.has(parsed.setId)) continue;
      const track = trackByNumber.get(parsed.trackNumber);
      if (!track || track.slug !== parsed.slug) continue;

      const id = createHash('sha256').update(filename).digest('hex').slice(0, 24);
      names.set(id, filename);
      if (take.online) {
        track.takes.push({ ...take, id, letter: parsed.letter });
        online++;
      } else {
        const folder = path.join(staging, 'audio');
        await mkdir(folder, { recursive: true });
        const src = `audio/${id}.mp3`;
        await copyFile(path.join(audioRoot, filename), path.join(staging, src));
        files.push(src);
        track.takes.push({ src, online: false, id, letter: parsed.letter });
        offline++;
      }
    }
    if (streamsOnly && !online) throw new Error('No public streams are ready for this album.');
    await withPreviewWriter(root, 'labels', () => assignLabels(root, albumKey, tracks));
    const html = await renderPreview(album, tracks, albumKey, legacyAlbumKey);
    await writeFile(path.join(staging, files[0]), html);
    const archive = path.join(parent, 'album-preview.zip');
    if (makeZip) {
      execFileSync('zip', ['-q', '-0', path.join(staging, 'preview.zip'), ...files], {
        cwd: staging,
      });
    }
    for (const file of files.slice(1)) {
      await mkdir(path.join(output, 'audio'), { recursive: true });
      await rename(path.join(staging, file), path.join(output, file));
    }
    const page = path.join(output, files[0]);
    await rename(path.join(staging, files[0]), page);
    if (makeZip) await rename(path.join(staging, 'preview.zip'), archive);
    // The running local player reads one complete catalog per request. Keep the
    // mapping to original filenames outside both the public export and the ZIP.
    const catalogPath = path.join(parent, 'album-preview-catalog.json');
    if (output === path.join(root, '.tmp', 'album-preview')) {
      const pending = path.join(staging, 'local-catalog.json');
      const catalog = { albumKey, html, files: files.slice(1), names: [...names] };
      await writeFile(pending, JSON.stringify(catalog), { mode: 0o600 });
      await rename(pending, catalogPath);
    }
    const url = serve ? await servePreview({ output, catalogPath, albumKey }) : null;
    return {
      report: {
        page,
        link: page,
        elapsedMs: Math.round(performance.now() - startedAt),
        offline,
        online,
        ...(makeZip ? { archive } : {}),
        ...(url ? { url } : {}),
      },
      sources: tracks.flatMap(track => track.takes.map(take => take.src)),
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function preview(root, options = {}) {
  return withPreviewWriter(root, options.streamsOnly ? 'streams' : 'files', () =>
    exportPreview(root, options)
  );
}

export async function recordReadyTakes(root, receipt) {
  return withPreviewWriter(root, 'streams', async () => {
    const album = await readJson(path.join(root, 'album/album.json'));
    const next = mergeReadyTakes(await readStreams(root), receipt, album);
    const directory = path.join(root, '.tmp');
    await saveJson(path.join(directory, 'album-preview-streams.json'), next);
    // A retry also finishes any interrupted render after the catalog was saved.
    return exportPreview(root, { streamsOnly: true });
  });
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    const recording = args.length === 2 && args[0] === '--record';
    if (
      !recording &&
      (args.length > 1 ||
        (args.length === 1 && !['--zip', '--serve', '--streams-only'].includes(args[0])))
    ) {
      throw new Error(
        'Usage: pnpm preview:album [--zip | --serve | --streams-only | --record <ready-take.json>]'
      );
    }
    const { report } = recording
      ? await recordReadyTakes(process.cwd(), await readJson(args[1]))
      : await preview(process.cwd(), {
          makeZip: args.includes('--zip'),
          serve: args.includes('--serve'),
          streamsOnly: args.includes('--streams-only'),
        });
    console.log(JSON.stringify(report));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
