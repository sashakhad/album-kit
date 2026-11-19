#!/usr/bin/env node
/**
 * Measures --record speed and the shrunk Open Album.html for four public Suno takes.
 * Exits non-zero when a record is slower than 1.5s or the inlined page is 22 MB or larger.
 *
 *   node --experimental-strip-types scripts/measure-embedded-page.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT = 22 * 1024 * 1024;
const RECORD_LIMIT_MS = 1500;
const TAKES = [
  'ab2356d9-2f04-4e9d-a1f0-b78c839cbe76',
  '271c02c7-4af5-4801-8584-caebd56214ae',
  '40cea432-c158-49a6-9a53-4c94169d6194',
  '327ebc65-b823-4571-a4e6-c32260abd04c',
];

const album = await mkdtemp(path.join(tmpdir(), 'open-album-size-'));
const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(kit, 'scripts/preview-album.mjs');
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
    const recorded = await runNode([script, '--record', receipt], album, {
      ALBUM_PREVIEW_SHRINK: '0',
    });
    const recordMs = Math.round(performance.now() - started);
    takes.push({
      id,
      mp4Bytes: size,
      recordMs,
      pageReady: recorded.pageReady === true,
    });
  }
  const startedPage = performance.now();
  const ready = await runNode([script, '--page'], album, {});
  const pageMs = Math.round(performance.now() - startedPage);
  if (ready.pageReady !== true || typeof ready.page !== 'string') {
    throw new Error('The shrunk page was not ready.');
  }
  const htmlBytes = (await stat(ready.page)).size;
  const shellBytes = (await stat(path.join(kit, 'scripts/player-shell.html'))).size;
  const beforeHtmlEstimate = shellBytes + Math.ceil(mp4Bytes / 3) * 4;
  const report = {
    takes,
    mp4Bytes,
    beforeHtmlEstimate,
    htmlBytes,
    pageMs,
    limit: LIMIT,
    recordLimitMs: RECORD_LIMIT_MS,
    underLimit: htmlBytes < LIMIT,
    recordsFast: takes.every(take => take.recordMs < RECORD_LIMIT_MS),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.underLimit || !report.recordsFast) process.exitCode = 1;
} finally {
  await rm(album, { recursive: true, force: true });
}

function runNode(args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `preview-album exited ${String(code)}`));
        return;
      }
      const line = stdout
        .trim()
        .split('\n')
        .find(item => item.startsWith('{'));
      if (line === undefined) {
        reject(new Error(`preview did not print JSON: ${stderr}`));
        return;
      }
      resolve(JSON.parse(line));
    });
  });
}
