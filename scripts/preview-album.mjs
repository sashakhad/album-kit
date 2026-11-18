#!/usr/bin/env node
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

import { parseCanonicalTake } from '../src/lib/album/parse-filename.ts';
import { isPlayableStream, isVideoStream } from '../src/lib/album/stream-url.ts';

import { servePreview } from './preview-server.mjs';

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw error;
  }
}

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

function albumKeyFor(album) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        title: album.title,
        tracks: album.tracks.map(track => [track.number, track.slug]),
      })
    )
    .digest('hex')
    .slice(0, 16);
}

async function renderPreview(album, tracks, albumKey) {
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
        .map((take, index) => {
          const label = `Take ${takeLabel(index + 1)}`;
          return `<button type="button" aria-pressed="false" data-src="${escapeHtml(take.src)}"
        data-id="${take.id}" data-title="${title}" data-label="${label}" data-online="${take.online}"
        data-kind="${isVideoStream(take.src) ? 'video' : 'audio'}">${label}${
          take.online ? ' <small>Internet required</small>' : ''
        } <small data-score>0</small></button>`;
        })
        .join('');
      return `<section class="track"><h2><span class="track-number">${number}</span>${title}</h2>
      ${takes ? `<div class="takes">${takes}</div>` : '<p class="muted">No takes ready yet.</p>'}</section>`;
    })
    .join('');

  const replacements = {
    title: escapeHtml(album.title),
    artist: album.artist ? `<p class="artist">${escapeHtml(album.artist)}</p>` : '',
    tracks: sections || '<p class="muted">No tracks yet.</p>',
    theme,
    albumKey: JSON.stringify(albumKey),
  };
  return template.replace(
    /\{\{(title|artist|tracks|theme|albumKey)\}\}/g,
    (_, key) => replacements[key]
  );
}

async function preview(root, makeZip, serve) {
  const startedAt = Date.now();
  const albumRoot = path.join(root, 'album');
  const audioRoot = path.join(albumRoot, 'audio');
  const output = path.join(root, '.tmp', 'album-preview');
  const album = await readJson(path.join(albumRoot, 'album.json'));
  const albumKey = albumKeyFor(album);
  const streams = await readJson(path.join(root, '.tmp', 'album-preview-streams.json'), []);
  if (!Array.isArray(streams)) throw new Error('The preview stream catalog must be a JSON array.');

  const localFiles = await readdir(audioRoot, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
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
  for (const entry of localFiles) {
    if (entry.isFile()) inputs.set(entry.name, { online: false });
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
        track.takes.push({ ...take, id });
        online++;
      } else {
        const folder = path.join(staging, 'audio');
        await mkdir(folder, { recursive: true });
        const src = `audio/${track.number}-${track.takes.length + 1}.mp3`;
        await copyFile(path.join(audioRoot, filename), path.join(staging, src));
        files.push(src);
        track.takes.push({ src, online: false, id });
        offline++;
      }
    }
    await writeFile(path.join(staging, files[0]), await renderPreview(album, tracks, albumKey));
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
    const url = serve
      ? await servePreview({ output, files: new Set(files.slice(1)), names, albumKey })
      : null;
    console.log(
      JSON.stringify({
        page,
        link: page,
        elapsedMs: Date.now() - startedAt,
        offline,
        online,
        ...(makeZip ? { archive } : {}),
        ...(url ? { url } : {}),
      })
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !['--zip', '--serve'].includes(args[0]))) {
    throw new Error('Usage: pnpm preview:album [--zip | --serve]');
  }
  await preview(process.cwd(), args.includes('--zip'), args.includes('--serve'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
