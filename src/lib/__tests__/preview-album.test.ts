// @vitest-environment node
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { shellStamp } from '../../../scripts/build-player-shell.mjs';
import { PLAYER_SHELL_CSP } from '@/lib/album/content-security';
import { embedPublicAudio } from '@/lib/album/embed-public-audio';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const previewScript = path.join(kitRoot, 'scripts', 'preview-album.mjs');
const localName = 'v1-01-porch-light-p1-takea.mp3';
const streamName = 'v1-01-porch-light-p1-takeb.mp3';

type PreviewReport = {
  page: string;
  offline: number;
  online: number;
  archive?: string;
  url?: string;
  link?: string;
  elapsedMs?: number;
};

type Ballot = {
  selected: string | null;
  votes: Record<string, number>;
  pass?: number;
  retired?: string[];
};

const children: ChildProcess[] = [];
const roots: string[] = [];

afterEach(async () => {
  for (const child of children) {
    child.kill('SIGTERM');
  }
  children.length = 0;
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
  roots.length = 0;
});

function takeId(filename: string): string {
  return createHash('sha256').update(filename).digest('hex').slice(0, 24);
}

function readReport(stdout: string): PreviewReport {
  const line = stdout
    .trim()
    .split('\n')
    .find(item => item.startsWith('{'));
  if (line === undefined) {
    throw new Error(`preview did not print JSON: ${stdout}`);
  }
  const value: unknown = JSON.parse(line);
  if (typeof value !== 'object' || value === null) {
    throw new Error('preview JSON was not an object');
  }
  if (!('page' in value) || typeof value.page !== 'string') {
    throw new Error('preview JSON has no page');
  }
  if (!('offline' in value) || typeof value.offline !== 'number') {
    throw new Error('preview JSON has no offline count');
  }
  if (!('online' in value) || typeof value.online !== 'number') {
    throw new Error('preview JSON has no online count');
  }
  const report: PreviewReport = {
    page: value.page,
    offline: value.offline,
    online: value.online,
  };
  if ('archive' in value && typeof value.archive === 'string') report.archive = value.archive;
  if ('url' in value && typeof value.url === 'string') report.url = value.url;
  if ('link' in value && typeof value.link === 'string') report.link = value.link;
  if ('elapsedMs' in value && typeof value.elapsedMs === 'number') {
    report.elapsedMs = value.elapsedMs;
  }
  return report;
}

function readBallot(value: unknown): Ballot {
  if (typeof value !== 'object' || value === null || !('votes' in value)) {
    throw new Error('ballot JSON was not an object');
  }
  const votes: Record<string, number> = {};
  if (typeof value.votes === 'object' && value.votes !== null) {
    for (const [key, score] of Object.entries(value.votes)) {
      if (typeof score === 'number') votes[key] = score;
    }
  }
  const selected =
    'selected' in value && typeof value.selected === 'string' ? value.selected : null;
  const pass = 'pass' in value && typeof value.pass === 'number' ? value.pass : undefined;
  const retired =
    'retired' in value && Array.isArray(value.retired)
      ? value.retired.filter((item): item is string => typeof item === 'string')
      : undefined;
  return {
    selected,
    votes,
    ...(pass === undefined ? {} : { pass }),
    ...(retired ? { retired } : {}),
  };
}

async function writeFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'album-preview-'));
  roots.push(root);
  await mkdir(path.join(root, 'album', 'audio'), { recursive: true });
  await mkdir(path.join(root, '.tmp'), { recursive: true });
  const album = {
    title: 'Porch Light',
    artist: 'Album Bot',
    genre: 'soul',
    rule: '',
    sets: [{ id: 'v1', name: 'First' }],
    tracks: [
      { number: 1, title: 'Porch Light', slug: 'porch-light' },
      { number: 2, title: 'Parked', slug: 'parked', parked: true },
    ],
  };
  await writeFile(path.join(root, 'album', 'album.json'), JSON.stringify(album));
  await writeFile(path.join(root, 'album', 'audio', localName), Buffer.from('local-mp3-bytes'));
  await writeFile(
    path.join(root, 'album', 'audio', 'v1-02-parked-p1-takea.mp3'),
    Buffer.from('parked')
  );
  await writeFile(
    path.join(root, 'album', 'audio', 'v1-01-other-song-p1-takea.mp3'),
    Buffer.from('wrong-slug')
  );
  await writeFile(
    path.join(root, '.tmp', 'album-preview-streams.json'),
    JSON.stringify([
      {
        filename: localName,
        clipId: 'clipA',
        streamUrl: 'https://cdn1.suno.ai/clipA.mp4',
      },
      {
        filename: streamName,
        clipId: 'clipB',
        streamUrl: 'https://cdn1.suno.ai/clipB.mp4',
      },
      {
        filename: 'v1-01-porch-light-p1-takec.mp3',
        clipId: 'clipC',
        streamUrl: 'https://example.com/secret.mp3',
      },
    ])
  );
  return root;
}

function runPreview(
  root: string,
  args: string[]
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const serve = args.includes('--serve');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', previewScript, ...args], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let stdout = '';
    let stderr = '';
    let settled = false;
    function finish(code: number | null) {
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr });
    }
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (serve && stdout.includes('\n')) finish(null);
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => {
      finish(code);
    });
  });
}

async function putBallot(pageUrl: string, body: Record<string, unknown>): Promise<Ballot> {
  const response = await fetch(new URL('/ballot', pageUrl), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Origin: pageUrl.replace(/\/$/, ''),
    },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return readBallot(await response.json());
}

async function putVote(pageUrl: string, take: string, delta: number): Promise<Ballot> {
  return putBallot(pageUrl, { take, vote: delta });
}

describe('album preview', () => {
  it('keeps the prebuilt listen shell aligned with the app player', () => {
    const shell = readFileSync(path.join(kitRoot, 'scripts/player-shell.html'), 'utf8');
    expect(shell).toContain(`<!-- player-shell ${shellStamp()} -->`);
    expect(shell).toContain(PLAYER_SHELL_CSP);
    expect(shell).toContain('___ALBUM_DATA___');
    expect(shell).toContain('id="album-root"');
  });

  it('bundles a local MP3, lists public and local takes without a public-link warning, and skips private URLs', async () => {
    const root = await writeFixture();
    const result = await runPreview(root, ['--zip']);
    expect(result.code).toBe(0);
    const report = readReport(result.stdout);
    expect(report.offline).toBe(1);
    expect(report.online).toBe(1);
    expect(report.archive).toBeDefined();

    const unpacked = path.join(root, 'unpacked');
    await mkdir(unpacked);
    execFileSync('unzip', ['-q', report.archive ?? '', '-d', unpacked]);
    const html = await readFile(path.join(unpacked, 'Open Album.html'), 'utf8');
    const localSrc = `audio/${takeId(localName)}.mp3`;
    const audio = await readFile(path.join(unpacked, localSrc));
    expect(audio.toString()).toBe('local-mp3-bytes');
    expect(html).toContain(localSrc);
    expect(html).toContain('https://cdn1.suno.ai/clipB.mp4');
    expect(html).not.toMatch(/streams from a public Suno link|anyone with that link/i);
    expect(html).not.toContain('example.com');
    expect(html).not.toContain('Parked');
    expect(html).not.toContain('other-song');
    expect(html).not.toContain('clipA.mp4');
    expect(html).toContain('oklch(0.145 0 0)');
  });

  it('inlines cached public audio and keeps the CDN url on the take', async () => {
    const root = await writeFixture();
    const bytes = Buffer.from('inline-audio-bytes');
    await embedPublicAudio({
      url: 'https://cdn1.suno.ai/clipB.mp4',
      cacheDir: path.join(root, '.tmp', 'album-preview-embedded'),
      allowNetwork: true,
      ffmpegBin: null,
      fetchImpl: () =>
        Promise.resolve({
          status: 200,
          headers: {
            get(name: string) {
              return name.toLowerCase() === 'content-type' ? 'audio/mp4' : null;
            },
          },
          arrayBuffer() {
            return Promise.resolve(Uint8Array.from(bytes).buffer);
          },
        }),
    });
    const result = await runPreview(root, ['--streams-only']);
    expect(result.code).toBe(0);
    const html = await readFile(readReport(result.stdout).page, 'utf8');
    const raw = /<script type="application\/json" id="album-data">([\s\S]*?)<\/script>/.exec(
      html
    )?.[1];
    expect(raw).toBeDefined();
    const payload = JSON.parse(raw ?? '') as {
      version: {
        tracks: {
          takes: { audioUrl: string; embeddedAudio?: { mime: string; base64: string } }[];
        }[];
      };
    };
    const takes = payload.version.tracks.flatMap(track => track.takes);
    expect(
      takes.find(take => take.audioUrl === 'https://cdn1.suno.ai/clipB.mp4')?.embeddedAudio
    ).toEqual({
      mime: 'audio/mp4',
      base64: bytes.toString('base64'),
    });
    expect(
      takes.find(take => take.audioUrl === 'https://cdn1.suno.ai/clipA.mp4')?.embeddedAudio
    ).toBeUndefined();
    expect(html).toContain('https://cdn1.suno.ai/clipB.mp4');
  });

  it('hands off one standalone HTML file when the first public take is ready', async () => {
    const root = await writeFixture();
    const catalog = path.join(root, '.tmp', 'album-preview-streams.json');
    await writeFile(
      catalog,
      JSON.stringify([
        { filename: localName, clipId: 'clipA', streamUrl: 'https://cdn1.suno.ai/clipA.mp4' },
      ])
    );
    const result = await runPreview(root, ['--streams-only']);
    expect(result.code).toBe(0);
    const report = readReport(result.stdout);
    expect(report).toMatchObject({ offline: 0, online: 1 });
    expect(await readdir(path.dirname(report.page))).toEqual(['Open Album.html']);
    const html = await readFile(report.page, 'utf8');
    expect(html).toContain('https://cdn1.suno.ai/clipA.mp4');
    expect(html).not.toMatch(/"audio\/[a-f0-9]+\.mp3"/);
    await writeFile(catalog, '[]');
    const empty = await runPreview(root, ['--streams-only']);
    expect(empty.code).toBe(1);
    expect(empty.stdout).toBe('');
  });

  it('plays and scores later takes at the original link after a normal refresh', async () => {
    const root = await writeFixture();
    const audio = path.join(root, 'album', 'audio');
    await rename(path.join(audio, localName), path.join(audio, streamName));
    await writeFile(path.join(root, '.tmp', 'album-preview-streams.json'), '[]');
    const first = readReport((await runPreview(root, ['--serve'])).stdout);
    const url = first.url ?? '';
    const audioUrl = (name: string) => new URL(`audio/${takeId(name)}.mp3`, url);
    const firstAudio = await (await fetch(audioUrl(streamName))).text();
    await putVote(url, takeId(streamName), 1);

    // The later take sorts before the one already playing.
    await writeFile(path.join(audio, localName), 'later-audio');
    expect((await runPreview(root, [])).code).toBe(0);
    const updated = await (await fetch(url)).text();
    expect(updated).toContain(takeId(localName));
    expect(await (await fetch(audioUrl(streamName))).text()).toBe(firstAudio);
    expect(await (await fetch(audioUrl(localName))).text()).toBe('later-audio');
    const ballot = await putVote(url, takeId(localName), -1);
    expect(ballot.votes).toEqual({ [takeId(streamName)]: 1, [takeId(localName)]: -1 });

    await rm(path.join(audio, localName));
    expect((await runPreview(root, [])).code).toBe(0);
    expect((await fetch(audioUrl(localName))).status).toBe(404);
  });

  it('keeps the first album link, scores and current pass when a new song arrives', async () => {
    const root = await writeFixture();
    const pageUrl = readReport((await runPreview(root, ['--serve'])).stdout).url ?? '';
    const oldId = takeId(localName);
    await putVote(pageUrl, oldId, 1);
    await putBallot(pageUrl, { action: 'next-pass' });
    const manifest = path.join(root, 'album', 'album.json');
    const album = JSON.parse(await readFile(manifest, 'utf8'));
    album.tracks.push({ number: 3, slug: 'encore', title: 'Encore' });
    await writeFile(manifest, JSON.stringify(album));
    const next = 'v1-03-encore-p1-takea.mp3';
    await writeFile(path.join(root, 'album/audio', next), 'new-audio');
    expect((await runPreview(root, [])).code).toBe(0);
    const response = await fetch(pageUrl);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Encore');
    const updated = await putVote(pageUrl, takeId(next), -1);
    expect(updated.pass).toBe(2);
    expect(updated.votes).toEqual({ [oldId]: 1, [takeId(next)]: -1 });
  });

  it('keeps a first standalone export playable with corrupt optional legacy metadata', async () => {
    const root = await writeFixture();
    for (const file of ['album-preview-catalog.json', 'album-preview-ballot.json']) {
      await writeFile(path.join(root, '.tmp', file), 'unreadable');
    }
    const result = await runPreview(root, ['--streams-only']);
    expect(result.code).toBe(0);
    expect(readReport(result.stdout).online).toBe(2);
    expect(await readFile(path.join(root, '.tmp/album-preview-ballot.json'), 'utf8')).toBe(
      'unreadable'
    );
  });

  it('keeps cumulative scores across a preview restart', async () => {
    const root = await writeFixture();
    const first = readReport((await runPreview(root, ['--serve'])).stdout);
    expect(first.url).toBeDefined();
    const pageUrl = first.url ?? '';
    const localId = takeId(localName);
    const streamId = takeId(streamName);

    await putVote(pageUrl, localId, 1);
    await putVote(pageUrl, localId, 1);
    const afterThird = await putVote(pageUrl, localId, 1);
    expect(afterThird.votes[localId]).toBe(3);
    const afterSubtract = await putVote(pageUrl, localId, -1);
    expect(afterSubtract.votes[localId]).toBe(2);
    await putVote(pageUrl, streamId, -1);
    await putBallot(pageUrl, { take: localId });
    const other = await putBallot(pageUrl, { take: streamId, vote: -1, select: false });
    expect(other.selected).toBe(localId);
    expect(other.votes[localId]).toBe(2);
    expect(other.votes[streamId]).toBe(-2);

    for (const child of children) child.kill('SIGTERM');
    children.length = 0;
    await new Promise<void>(resolve => {
      setTimeout(resolve, 50);
    });

    const second = readReport((await runPreview(root, ['--serve'])).stdout);
    const reloaded = await fetch(new URL('/ballot', second.url ?? ''));
    expect(reloaded.status).toBe(200);
    const ballot = readBallot(await reloaded.json());
    expect(ballot.votes[localId]).toBe(2);
    expect(ballot.votes[streamId]).toBe(-2);
    expect(ballot.selected).toBe(localId);
    expect(ballot.pass).toBe(1);
  });

  it('keeps pass two and a positive score after restart, and starts a new album clean', async () => {
    const root = await writeFixture();
    const first = readReport((await runPreview(root, ['--serve'])).stdout);
    const pageUrl = first.url ?? '';
    const localId = takeId(localName);
    const streamId = takeId(streamName);
    await putVote(pageUrl, localId, 1);
    await putVote(pageUrl, streamId, -1);
    const advanced = await putBallot(pageUrl, { action: 'next-pass' });
    expect(advanced.pass).toBe(2);
    expect(advanced.votes[localId]).toBe(1);
    expect(advanced.votes[streamId]).toBeUndefined();
    expect(advanced.retired).toContain(streamId);

    for (const child of children) child.kill('SIGTERM');
    children.length = 0;
    await new Promise<void>(resolve => {
      setTimeout(resolve, 50);
    });

    const restarted = readReport((await runPreview(root, ['--serve'])).stdout);
    const kept = readBallot(await (await fetch(new URL('/ballot', restarted.url ?? ''))).json());
    expect(kept.pass).toBe(2);
    expect(kept.votes[localId]).toBe(1);

    for (const child of children) child.kill('SIGTERM');
    children.length = 0;
    const albumPath = path.join(root, 'album', 'album.json');
    const album = JSON.parse(await readFile(albumPath, 'utf8')) as { title: string };
    album.title = 'Second Album';
    await writeFile(albumPath, JSON.stringify(album));
    const second = readReport((await runPreview(root, ['--serve'])).stdout);
    const fresh = readBallot(await (await fetch(new URL('/ballot', second.url ?? ''))).json());
    expect(fresh.pass).toBe(1);
    expect(fresh.votes).toEqual({});
  });

  it('fills Open Album.html from stream URLs without a zip or a server', async () => {
    const root = await writeFixture();
    const first = await runPreview(root, []);
    expect(first.code).toBe(0);
    const report = readReport(first.stdout);
    expect(report.archive).toBeUndefined();
    expect(report.url).toBeUndefined();
    expect(report.link).toBe(report.page);
    expect(report.page.endsWith(`${path.sep}Open Album.html`)).toBe(true);
    expect(report.elapsedMs).toBeLessThan(10000);
    const html = await readFile(report.page, 'utf8');
    expect(html).toContain('https://cdn1.suno.ai/clipB.mp4');

    const again = readReport((await runPreview(root, [])).stdout);
    expect(again.link).toBe(report.link);
    expect(again.elapsedMs).toBeLessThan(10000);
  });

  it('opens a titled page before any stream exists', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'album-open-'));
    roots.push(root);
    await mkdir(path.join(root, 'album'), { recursive: true });
    await writeFile(
      path.join(root, 'album', 'album.json'),
      JSON.stringify({
        title: 'Mirage Motel',
        artist: 'Album Bot',
        sets: [{ id: 'v1', name: 'First' }],
        tracks: [
          { number: 1, title: 'Vacancy', slug: 'vacancy' },
          { number: 2, title: 'Ice Machine', slug: 'ice-machine' },
        ],
      })
    );
    const opened = await runPreview(root, ['--open']);
    expect(opened.code).toBe(0);
    const report = readReport(opened.stdout);
    expect(report.online).toBe(0);
    expect(report.offline).toBe(0);
    const html = await readFile(report.page, 'utf8');
    expect(html).toContain('Vacancy');
    expect(html).toContain('Ice Machine');
    expect(html).not.toContain('cdn1.suno.ai');
    expect(opened.stdout).toContain('The titles are in.');
  });

  it('rejects unknown arguments', async () => {
    const root = await writeFixture();
    const result = await runPreview(root, ['--zip', '--serve']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Usage: pnpm preview:album');
  });
});
