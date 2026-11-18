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
import { previewListenBlurb, previewListenVersion } from '../src/lib/album/preview-listen.ts';
import { isPlayableStream } from '../src/lib/album/stream-url.ts';

import { servePreview } from './preview-server.mjs';
import { previewIdentity } from './preview-identity.mjs';
import { renderAlbumPagePng } from './page-preview.mjs';
import { deliverySay, markPageDelivered, trackProgressLine } from './live-progress.mjs';

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

function labelsInPage(html) {
  const labels = new Map();
  const raw = /<script type="application\/json" id="album-data">([\s\S]*?)<\/script>/.exec(
    html
  )?.[1];
  if (raw && raw !== '___ALBUM_DATA___') {
    try {
      const payload = JSON.parse(raw);
      for (const track of payload.version?.tracks ?? []) {
        for (const take of track.takes ?? []) {
          if (
            typeof take.filename === 'string' &&
            /^[A-Z]+$/.test(take.label) &&
            !labels.has(take.filename)
          ) {
            labels.set(take.filename, take.label);
          }
        }
      }
    } catch {
      // A page from before the listen shell keeps its letters on the buttons.
    }
  }
  for (const [button] of html.matchAll(/<button\b[^>]*>/g)) {
    const id = / data-id="([a-f0-9]{24})"/.exec(button)?.[1];
    const letter = / data-label="Take ([A-Z]+)"/.exec(button)?.[1];
    if (id && letter && !labels.has(id)) labels.set(id, letter);
  }
  return labels;
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
    for (const [id, letter] of labelsInPage(html)) {
      if (!labels.has(id)) labels.set(id, letter);
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

function jsonForScript(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function landedLabel(tracks, previous) {
  const groups = [];
  for (const track of tracks) {
    const letters = [];
    for (const take of track.takes) {
      if (!previous.has(take.id)) letters.push(take.letter);
    }
    if (letters.length > 0) groups.push({ number: track.number, letters });
  }
  if (groups.length === 1) return trackProgressLine(groups[0].number, groups[0].letters);
  if (groups.length > 1) return 'More takes are in.';
  return '';
}

async function renderPreview(album, tracks, albumKey) {
  const shell = await readFile(new URL('./player-shell.html', import.meta.url), 'utf8');
  if (
    !shell.includes('___ALBUM_DATA___') ||
    !shell.includes('___ALBUM_TITLE___') ||
    !shell.includes('___ALBUM_KEY___')
  ) {
    throw new Error('The listen player shell is missing. Run pnpm player:shell.');
  }
  const artist = typeof album.artist === 'string' ? album.artist : '';
  const version = previewListenVersion(
    { title: album.title, artist },
    tracks.map(track => ({
      number: track.number,
      title: track.title,
      slug: track.slug,
      takes: track.takes.map(take => ({ id: take.id, src: take.src, label: take.letter })),
    }))
  );
  return shell
    .replaceAll('___ALBUM_TITLE___', escapeHtml(album.title))
    .replaceAll(
      '___ALBUM_DATA___',
      jsonForScript({
        title: album.title,
        artist,
        blurb: previewListenBlurb(version),
        version,
      })
    )
    .replaceAll('___ALBUM_KEY___', jsonForScript(albumKey));
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
    const previous = await priorLabels(root, albumKey);
    await withPreviewWriter(root, 'labels', () => assignLabels(root, albumKey, tracks));
    const html = await renderPreview(album, tracks, albumKey);
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
    const previewImage = path.join(output, 'Album page.png');
    const shown = [];
    for (const track of tracks) {
      if (track.takes.length === 0) continue;
      const letters = [];
      for (const take of track.takes) letters.push(take.letter);
      shown.push({ title: track.title, letters });
    }
    await writeFile(
      previewImage,
      renderAlbumPagePng({
        title: typeof album.title === 'string' ? album.title : 'Album',
        tracks: shown,
      })
    );
    const pendingTracks = tracks.some(track => track.takes.length === 0);
    const say = deliverySay({
      first: previous.size === 0,
      pendingTracks,
      landedLabel: landedLabel(tracks, previous),
    });
    await markPageDelivered(root);
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
        preview: previewImage,
        say,
        open: page,
        shareCard: false,
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
