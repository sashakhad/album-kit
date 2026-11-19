#!/usr/bin/env node
/**
 * Measures Open Album.html for four public Suno takes.
 * Exits non-zero when the inlined page is 22 MB or larger.
 *
 *   node --experimental-strip-types scripts/measure-embedded-page.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT = 22 * 1024 * 1024;
const TAKES = [
  'ab2356d9-2f04-4e9d-a1f0-b78c839cbe76',
  '271c02c7-4af5-4801-8584-caebd56214ae',
  '40cea432-c158-49a6-9a53-4c94169d6194',
  '327ebc65-b823-4571-a4e6-c32260abd04c',
];

const album = await mkdtemp(path.join(tmpdir(), 'open-album-size-'));
const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  await mkdir(path.join(album, 'album'));
  const tracks = [];
  for (let index = 0; index < TAKES.length; index += 1) {
    const id = TAKES[index] ?? '';
    tracks.push({
      number: index + 1,
      title: `Take ${id.slice(0, 8)}`,
      slug: `take-${String(index + 1)}`,
    });
  }
  await writeFile(
    path.join(album, 'album/album.json'),
    JSON.stringify({ title: 'Size check', sets: [{ id: 'v1', name: 'First' }], tracks })
  );
  const takes = [];
  let mp4Bytes = 0;
  for (let index = 0; index < TAKES.length; index += 1) {
    const id = TAKES[index] ?? '';
    const url = `https://cdn1.suno.ai/${id}.mp4`;
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status}`);
    const size = Number(response.headers.get('content-length'));
    if (!Number.isFinite(size) || size <= 0) throw new Error(`No length for ${url}`);
    mp4Bytes += size;
    const filename = `v1-${String(index + 1).padStart(2, '0')}-take-${String(index + 1)}-p1-takea.mp3`;
    const receipt = path.join(album, `${id}.json`);
    await writeFile(receipt, JSON.stringify({ filename, clipId: id, streamUrl: url }));
    const started = performance.now();
    await runNode([path.join(kit, 'scripts/preview-album.mjs'), '--record', receipt], album);
    takes.push({ id, mp4Bytes: size, recordMs: Math.round(performance.now() - started) });
  }
  const page = path.join(album, '.tmp/album-preview-online/Open Album.html');
  const htmlBytes = (await stat(page)).size;
  const shellBytes = (await stat(path.join(kit, 'scripts/player-shell.html'))).size;
  const beforeHtmlEstimate = shellBytes + Math.ceil(mp4Bytes / 3) * 4;
  const report = {
    takes,
    mp4Bytes,
    beforeHtmlEstimate,
    htmlBytes,
    limit: LIMIT,
    underLimit: htmlBytes < LIMIT,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.underLimit) process.exitCode = 1;
} finally {
  await rm(album, { recursive: true, force: true });
}

function runNode(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(undefined);
      else reject(new Error(stderr || `preview-album exited ${String(code)}`));
    });
  });
}
