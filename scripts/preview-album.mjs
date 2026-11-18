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

import { embedPublicAudio, loadPublicSource } from '../src/lib/album/embed-public-audio.ts';
import {
  PAGE_BYTE_BUDGET,
  UNKNOWN_TAKE_SECONDS,
  albumPageName,
  lowerReviewBitrate,
  packPagesBySize,
  reviewBitrateKbps,
} from '../src/lib/album/embed-budget.ts';
import { parseCanonicalTake } from '../src/lib/album/parse-filename.ts';
import { previewListenBlurb, previewListenVersion } from '../src/lib/album/preview-listen.ts';
import { albumListenUrl, takeFromStreamUrl } from '../src/lib/album/link-fragment.ts';
import { isPlayableStream } from '../src/lib/album/stream-url.ts';

import { servePreview } from './preview-server.mjs';
import { previewIdentity } from './preview-identity.mjs';
import { captureAlbumPage } from './capture-page.mjs';
import { deliverySay, markPageDelivered, pageReady, trackProgressLine } from './live-progress.mjs';

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

function isAlbumPage(name) {
  return name === 'Open Album.html' || /^Open Album \d+\.html$/.test(name);
}

async function priorLabels(root, albumKey) {
  const labels = new Map();
  for (const directory of ['album-preview', 'album-preview-online']) {
    const folder = path.join(root, '.tmp', directory);
    const names = await readdir(folder).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const name of names) {
      if (!isAlbumPage(name)) continue;
      const html = await readFile(path.join(folder, name), 'utf8');
      if (!html.includes(`const albumKey = "${albumKey}";`)) continue;
      for (const [id, letter] of labelsInPage(html)) {
        if (!labels.has(id)) labels.set(id, letter);
      }
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

function takesForLink(takes) {
  const ordered = [...takes].sort((left, right) =>
    left.letter < right.letter ? -1 : left.letter > right.letter ? 1 : 0
  );
  const ready = [];
  for (const take of ordered) {
    const parsed = takeFromStreamUrl(take.src);
    if (parsed === null) continue;
    ready.push({ id: parsed.id, letter: take.letter, media: parsed.media });
  }
  return ready;
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

async function renderPreview(album, tracks, albumKey, title = album.title) {
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
    { title, artist },
    tracks.map(track => ({
      number: track.number,
      title: track.title,
      slug: track.slug,
      takes: track.takes.map(take => ({
        id: take.id,
        src: take.src,
        label: take.letter,
        ...(take.embeddedAudio === undefined ? {} : { embeddedAudio: take.embeddedAudio }),
      })),
    }))
  );
  return shell
    .replaceAll('___ALBUM_TITLE___', escapeHtml(title))
    .replaceAll(
      '___ALBUM_DATA___',
      jsonForScript({
        title,
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
    allowEmpty = false,
    output = path.join(root, '.tmp', streamsOnly ? 'album-preview-online' : 'album-preview'),
    pageBudgetBytes,
    ffmpegBin,
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
    if (streamsOnly && !online && !allowEmpty) {
      throw new Error('No public streams are ready for this album.');
    }
    const previous = await priorLabels(root, albumKey);
    await withPreviewWriter(root, 'labels', () => assignLabels(root, albumKey, tracks));
    const budgetBytes = resolvePageBudget(pageBudgetBytes);
    let embedded = await embedOnlineTakes(root, tracks, { budgetBytes, ffmpegBin });
    let bitrate = embedded.bitrateKbps;
    let html = await renderPreview(album, tracks, albumKey);
    if (ffmpegBin !== null) {
      let guard = 0;
      while (bitrate !== null && Buffer.byteLength(html) > budgetBytes && guard < 8) {
        const lower = lowerReviewBitrate(bitrate);
        if (lower === null) break;
        bitrate = lower;
        embedded = await embedOnlineTakes(root, tracks, {
          budgetBytes,
          ffmpegBin,
          bitrateKbps: bitrate,
        });
        html = await renderPreview(album, tracks, albumKey);
        guard += 1;
      }
    }
    const attachment = await attachmentPages(album, tracks, albumKey, html, budgetBytes);
    for (const part of attachment.parts) {
      await writeFile(path.join(staging, part.name), part.html);
    }
    const archive = path.join(parent, 'album-preview.zip');
    if (makeZip) {
      execFileSync(
        'zip',
        [
          '-q',
          '-0',
          path.join(staging, 'preview.zip'),
          ...attachment.parts.map(part => part.name),
          ...files.slice(1),
        ],
        { cwd: staging }
      );
    }
    for (const file of files.slice(1)) {
      await mkdir(path.join(output, 'audio'), { recursive: true });
      await rename(path.join(staging, file), path.join(output, file));
    }
    const partPaths = [];
    for (const part of attachment.parts) {
      const destination = path.join(output, part.name);
      await rename(path.join(staging, part.name), destination);
      partPaths.push(destination);
    }
    await removeStalePages(
      output,
      attachment.parts.map(part => part.name)
    );
    const page = partPaths[0];
    if (page === undefined) throw new Error('The album page was not written.');
    const artist = typeof album.artist === 'string' ? album.artist : '';
    const link = albumListenUrl({
      albumId: albumKey,
      title: album.title,
      ...(artist.length > 0 ? { artist } : {}),
      tracks: tracks.map(track => ({
        number: track.number,
        title: track.title,
        takes: takesForLink(track.takes),
      })),
    });
    const previewImage = await captureAlbumPage(page, path.join(root, '.tmp', 'Album page.png'));
    const pendingTracks = tracks.some(track => track.takes.length === 0);
    const say =
      online === 0
        ? pageReady
        : deliverySay({
            first: previous.size === 0,
            pendingTracks,
            landedLabel: landedLabel(tracks, previous),
            parts: partPaths.length,
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
        pages: partPaths,
        link,
        ...(previewImage ? { preview: previewImage } : {}),
        say,
        open: page,
        shareCard: false,
        elapsedMs: Math.round(performance.now() - startedAt),
        offline,
        online,
        ...(makeZip ? { archive } : {}),
        ...(url ? { url } : {}),
        ...(ffmpegBin !== null && bitrate !== null && embeddedAudioIsAac(tracks)
          ? { audioBitrateKbps: bitrate }
          : {}),
      },
      sources: tracks.flatMap(track => track.takes.map(take => take.src)),
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function resolvePageBudget(override) {
  if (typeof override === 'number' && override > 0) return override;
  const fromEnv = Number(process.env.ALBUM_PREVIEW_PAGE_BUDGET);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return PAGE_BYTE_BUDGET;
}

function letterRank(letter) {
  if (typeof letter !== 'string' || !/^[A-Z]+$/.test(letter)) return 0;
  let value = 0;
  for (const char of letter) value = value * 26 + (char.charCodeAt(0) - 64);
  return value;
}

function embeddedAudioIsAac(tracks) {
  let found = false;
  for (const track of tracks) {
    for (const take of track.takes) {
      if (take.embeddedAudio === undefined) continue;
      found = true;
      if (take.embeddedAudio.mime !== 'audio/mp4') return false;
    }
  }
  return found;
}

async function mapPool(items, limit, task) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      await task(item);
    }
  }
  const workers = [];
  const count = Math.min(Math.max(limit, 1), items.length);
  for (let index = 0; index < count; index += 1) workers.push(worker());
  await Promise.all(workers);
}

async function playerShellBytes() {
  const shell = await readFile(new URL('./player-shell.html', import.meta.url));
  return shell.length;
}

function onlineUrls(tracks) {
  const urls = [];
  const seen = new Set();
  for (const track of tracks) {
    for (const take of track.takes) {
      if (take.online !== true || typeof take.src !== 'string' || seen.has(take.src)) continue;
      seen.add(take.src);
      urls.push(take.src);
    }
  }
  return urls;
}

async function embedOnlineTakes(root, tracks, { budgetBytes, ffmpegBin, bitrateKbps } = {}) {
  const urls = onlineUrls(tracks);
  if (urls.length === 0) return { bitrateKbps: null };
  const cacheDir = path.join(root, '.tmp', 'album-preview-embedded');
  const allowNetwork = process.env.ALBUM_PREVIEW_EMBED !== '0';
  let bitrate = typeof bitrateKbps === 'number' ? bitrateKbps : null;
  if (bitrate === null) {
    const durations = [];
    await mapPool(urls, 3, async url => {
      const source = await loadPublicSource({ url, cacheDir, allowNetwork });
      if (source === null) return;
      durations.push(
        source.durationSeconds !== null && source.durationSeconds > 0
          ? source.durationSeconds
          : UNKNOWN_TAKE_SECONDS
      );
    });
    if (durations.length === 0) return { bitrateKbps: null };
    bitrate = reviewBitrateKbps({
      durationsSeconds: durations,
      shellBytes: await playerShellBytes(),
      budgetBytes,
    });
  }
  const embedded = new Map();
  await mapPool(urls, 3, async url => {
    const request = { url, cacheDir, allowNetwork, bitrateKbps: bitrate };
    if (ffmpegBin !== undefined) request.ffmpegBin = ffmpegBin;
    const audio = await embedPublicAudio(request);
    if (audio !== null) embedded.set(url, audio);
  });
  for (const track of tracks) {
    for (const take of track.takes) {
      if (take.online !== true || typeof take.src !== 'string') continue;
      const audio = embedded.get(take.src);
      if (audio !== undefined) take.embeddedAudio = audio;
      else delete take.embeddedAudio;
    }
  }
  return { bitrateKbps: bitrate };
}

function subsetTracks(tracks, ids, includeUnpackaged) {
  const want = new Set(ids);
  const selected = [];
  for (const track of tracks) {
    const takes = [];
    for (const take of track.takes) {
      const packed = take.online === true && take.embeddedAudio !== undefined;
      if (want.has(take.id) || (includeUnpackaged && !packed)) takes.push(take);
    }
    if (takes.length > 0) selected.push({ ...track, takes });
  }
  return selected;
}

async function attachmentPages(album, tracks, albumKey, fullHtml, budgetBytes) {
  if (Buffer.byteLength(fullHtml) <= budgetBytes) {
    return { parts: [{ name: albumPageName(0), html: fullHtml }] };
  }
  const sized = [];
  let audioChars = 0;
  for (const track of tracks) {
    for (const take of track.takes) {
      if (take.online !== true || take.embeddedAudio === undefined) continue;
      const pageBytes = take.embeddedAudio.base64.length;
      audioChars += pageBytes;
      sized.push({
        id: take.id,
        trackNumber: track.number,
        order: letterRank(take.letter),
        pageBytes,
      });
    }
  }
  const shellBytes = Math.max(0, Buffer.byteLength(fullHtml) - audioChars);
  const packed = packPagesBySize(sized, shellBytes, budgetBytes);
  const fitted = [];
  const pending = packed.map(group => [...group]);
  let index = 0;
  let guard = 0;
  while (index < pending.length && guard < sized.length + pending.length + 2) {
    guard += 1;
    const ids = pending[index];
    if (ids === undefined || ids.length === 0) {
      index += 1;
      continue;
    }
    const html = await renderPreview(album, subsetTracks(tracks, ids, index === 0), albumKey);
    // The titled part name adds a few bytes after this check.
    if (Buffer.byteLength(html) <= budgetBytes - 64 || ids.length === 1) {
      fitted.push(ids);
      index += 1;
      continue;
    }
    const moved = ids.pop();
    if (moved === undefined) {
      index += 1;
      continue;
    }
    const next = pending[index + 1];
    if (next) next.unshift(moved);
    else pending.push([moved]);
  }
  if (fitted.length === 0) return { parts: [{ name: albumPageName(0), html: fullHtml }] };
  const parts = [];
  for (let part = 0; part < fitted.length; part += 1) {
    const ids = fitted[part] ?? [];
    const title =
      fitted.length > 1
        ? `${album.title} (${String(part + 1)} of ${String(fitted.length)})`
        : album.title;
    parts.push({
      name: albumPageName(part),
      html: await renderPreview(album, subsetTracks(tracks, ids, part === 0), albumKey, title),
    });
  }
  return { parts };
}

async function removeStalePages(output, keep) {
  const kept = new Set(keep);
  const names = await readdir(output).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const name of names) {
    if (isAlbumPage(name) && !kept.has(name)) await rm(path.join(output, name));
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
        (args.length === 1 && !['--zip', '--serve', '--streams-only', '--open'].includes(args[0])))
    ) {
      throw new Error(
        'Usage: pnpm preview:album [--zip | --serve | --streams-only | --open | --record <ready-take.json>]'
      );
    }
    const opening = args.includes('--open');
    const { report } = recording
      ? await recordReadyTakes(process.cwd(), await readJson(args[1]))
      : await preview(process.cwd(), {
          makeZip: args.includes('--zip'),
          serve: args.includes('--serve'),
          streamsOnly: args.includes('--streams-only') || opening,
          allowEmpty: opening,
        });
    console.log(JSON.stringify(report));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
