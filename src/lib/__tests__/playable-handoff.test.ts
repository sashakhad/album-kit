import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { exporterFiles } from '../../../scripts/exporter-files.mjs';
import { handoffMediaOk, probeHandoff } from '../../../scripts/probe-stream.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function localImports(relativeFile: string): string[] {
  const source = readFileSync(path.join(root, relativeFile), 'utf8').replace(
    /import\s+type\s+[\s\S]*?\sfrom\s+['"][^'"]+['"];?/g,
    ''
  );
  const found: string[] = [];
  if (source.includes('player-shell.html')) found.push('scripts/player-shell.html');
  for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const spec = match[1];
    if (spec === undefined) continue;
    found.push(path.posix.normalize(path.posix.join(path.posix.dirname(relativeFile), spec)));
  }
  return found;
}

function closure(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    for (const next of localImports(file)) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

function runProbe(url: string): Promise<{ status: number | null; stdout: string }> {
  return new Promise(function settle(resolve, reject) {
    const child = spawn(process.execPath, [path.join(root, 'scripts/probe-stream.mjs'), url]);
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', function collect(chunk: string) {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('close', function closed(status) {
      resolve({ status, stdout });
    });
  });
}

describe('playable handoff', () => {
  it('accepts only 200 or 206 with video/mp4 or audio', () => {
    expect(handoffMediaOk(206, 'video/mp4')).toBe(true);
    expect(handoffMediaOk(200, 'video/mp4; charset=binary')).toBe(true);
    expect(handoffMediaOk(206, 'audio/mpeg')).toBe(true);
    expect(handoffMediaOk(200, 'Audio/mp4')).toBe(true);
    expect(handoffMediaOk(403, 'video/mp4')).toBe(false);
    expect(handoffMediaOk(206, 'text/html')).toBe(false);
    expect(handoffMediaOk(206, 'application/octet-stream')).toBe(false);
    expect(handoffMediaOk(206, 'video/webm')).toBe(false);
    expect(handoffMediaOk(200, '')).toBe(false);
    expect(handoffMediaOk(200, null)).toBe(false);
  });

  it('probes with a ranged GET and ignores a streaming-sized refusal', async () => {
    const server = createServer(function respond(request, response) {
      expect(request.headers.range).toBe('bytes=0-31');
      const playable = request.url === '/ready.mp4';
      response.writeHead(playable ? 206 : 403, {
        'content-type': playable ? 'video/mp4' : 'text/html',
      });
      response.end('0123456789abcdef');
    });
    await new Promise<void>(function listen(resolve) {
      server.listen(0, '127.0.0.1', function ready() {
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('No probe port.');
    const port = address.port;
    try {
      const ready = await probeHandoff(`http://127.0.0.1:${port}/ready.mp4`);
      expect(ready).toMatchObject({ ok: true, status: 206, contentType: 'video/mp4' });
      const early = await probeHandoff(`http://127.0.0.1:${port}/streaming.mp4`);
      expect(early.ok).toBe(false);
      expect(early.status).toBe(403);

      const cli = await runProbe(`http://127.0.0.1:${port}/ready.mp4`);
      expect(cli.status).toBe(0);
      expect(JSON.parse(cli.stdout)).toMatchObject({ ok: true, status: 206 });
    } finally {
      await new Promise<void>(function close(resolve, reject) {
        server.close(function closed(error) {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('keeps the installed exporter list equal to the files the player imports', async () => {
    const needed = new Set<string>([
      ...closure('scripts/preview-album.mjs'),
      ...closure('scripts/probe-stream.mjs'),
    ]);
    for (const file of needed) {
      expect(exporterFiles, file).toContain(file);
    }
    for (const file of exporterFiles) {
      expect(existsSync(path.join(root, file)), file).toBe(true);
    }
    const instructions = await readFile(path.join(root, 'grokbot/INSTRUCTIONS.md'), 'utf8');
    expect(instructions).toContain('before any Suno Create');
    expect(instructions).toContain('<album>/.album-kit/<sha>/<path>');
    for (const file of exporterFiles) {
      expect(instructions, file).toContain(file);
    }
  });

  it('records the first take from a kit copy that is not the album folder', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'playable-handoff-'));
    const album = path.join(parent, 'album-folder');
    const kit = path.join(parent, 'kit');
    try {
      await mkdir(path.join(album, 'album'), { recursive: true });
      await writeFile(
        path.join(album, 'album', 'album.json'),
        JSON.stringify({
          title: 'Paper Lantern',
          artist: 'Album Bot',
          sets: [{ id: 'v1', name: 'First' }],
          tracks: [{ number: 1, title: 'Paper Lantern', slug: 'paper-lantern' }],
        })
      );
      for (const file of exporterFiles) {
        const destination = path.join(kit, file);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, await readFile(path.join(root, file)));
      }
      expect(existsSync(path.join(album, 'scripts', 'preview-album.mjs'))).toBe(false);

      const receipt = path.join(album, 'ready.json');
      await writeFile(
        receipt,
        JSON.stringify({
          filename: 'v1-01-paper-lantern-p1-takea.mp3',
          clipId: 'fixture-1-a',
          streamUrl: 'https://cdn1.suno.ai/fixture-1-a.mp4',
        })
      );
      const stdout = execFileSync(
        process.execPath,
        [path.join(kit, 'scripts/preview-album.mjs'), '--record', receipt],
        { cwd: album, encoding: 'utf8', timeout: 10_000 }
      );
      const line = stdout
        .trim()
        .split('\n')
        .find(function jsonLine(item) {
          return item.startsWith('{');
        });
      if (line === undefined) throw new Error(`preview did not print JSON: ${stdout}`);
      const report: unknown = JSON.parse(line);
      if (typeof report !== 'object' || report === null || !('link' in report)) {
        throw new Error('preview JSON has no link');
      }
      const link = report.link;
      if (typeof link !== 'string') throw new Error('preview link was not a string');
      const html = await readFile(link, 'utf8');
      expect(html).toContain('Paper Lantern');
      expect(html).toContain('fixture-1-a');
      expect(path.dirname(link)).toBe(path.join(album, '.tmp', 'album-preview-online'));
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
