import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const docs = [
  'docs/prd.md',
  'docs/execution-plan.md',
  'docs/decision-charts.md',
  'docs/tester-walkthrough.md',
];

const retiredCopy = [
  'Album Bot Light',
  'streams from a public Suno link',
  'internet required',
  'Want to share it with other people',
  'Explain that review audio',
];

async function text(relativePath: string): Promise<string> {
  return readFile(relativePath, 'utf8');
}

function mermaidCount(body: string): number {
  let count = 0;
  for (const line of body.split('\n')) {
    if (line.startsWith('```mermaid')) count += 1;
  }
  return count;
}

describe('product handoff', () => {
  it('links the current requirements, plan, charts, and walkthrough', async function () {
    const bodies = new Map<string, string>();
    for (const file of docs) {
      bodies.set(file, await text(file));
    }
    for (const file of docs) {
      const body = bodies.get(file);
      if (body === undefined) throw new Error(`Missing ${file}`);
      for (const other of docs) {
        if (other === file) continue;
        expect(body).toContain(path.basename(other));
      }
      for (const phrase of retiredCopy) {
        expect(body).not.toContain(phrase);
      }
    }

    const requirements = bodies.get('docs/prd.md');
    if (requirements === undefined) throw new Error('Missing requirements');
    expect(requirements).toContain(
      "Hey, I'm Album Bot! Type /help for commands or /settings to see your setup. Let's get some music going."
    );
    expect(requirements).toContain(
      'Play and score a few tracks on this computer. I’ll use Suno’s lighter model when available. Works with Suno Free.'
    );
    expect(requirements).toContain(
      'Up to five different AI models each write a prompt for the same song. Compare the takes blind and hear a version that combines their ideas.'
    );
    expect(requirements).toContain('Your album is ready. What’s next?');
    expect(requirements).toContain('Share album');
    expect(requirements).toContain('Add more tracks');
    expect(requirements).toContain('Something else');
    expect(requirements).toContain('Grok Bot · model undisclosed');
    expect(requirements).toContain('generationCreditsAvailable: null');
    expect(requirements).toContain('six prompts and twelve takes');
    expect(requirements).toContain('grokbot/PORTABLE.md');
    expect(requirements).toContain('Sasha never hosts Album Bot for anyone.');
    expect(requirements).toContain('A new bot presumes start.');
    expect(requirements).toContain(
      'An active conversation resumes the current album and does not replay the opening.'
    );
    expect(requirements).toContain(
      'Explicit `/start` starts a fresh album and preserves the existing album, takes, scores, and jobs.'
    );
    expect(requirements).toContain('`/help` and `/settings` work before sign-in.');
    expect(requirements).toContain('Copy this sentence exactly');
    expect(requirements).toContain('A status of streaming is ready media for that clip.');
    expect(requirements).toContain('Do not run pnpm, an install, or a build');

    const charts = bodies.get('docs/decision-charts.md');
    if (charts === undefined) throw new Error('Missing charts');
    expect(mermaidCount(charts)).toBe(6);

    const guide = await text('README.md');
    const agents = await text('AGENTS.md');
    const portable = await text('grokbot/PORTABLE.md');
    for (const file of docs) {
      expect(guide).toContain(file);
    }
    expect(guide).toContain('grokbot/PORTABLE.md');
    expect(agents).toContain('grokbot/PORTABLE.md');
    expect(agents).toContain('docs/prd.md');
    expect(agents).toContain('actually returned the prompt');
    expect(portable).toContain('A requested name that did not run gets no credit.');
    expect(portable).toContain('Grok Bot · model undisclosed');
  });

  it('builds the first player screen, then keeps that take when another arrives', async function () {
    const root = await mkdtemp(path.join(tmpdir(), 'product-handoff-'));
    try {
      await mkdir(path.join(root, 'album'));
      await writeFile(
        path.join(root, 'album', 'album.json'),
        JSON.stringify({
          title: 'Paper Lantern',
          artist: 'Album Bot',
          sets: [{ id: 'v1', name: 'First' }],
          tracks: [{ number: 1, title: 'Paper Lantern', slug: 'paper-lantern' }],
        })
      );

      const first = await recordTake(root, 'a');
      expect(takeLabels(first)).toEqual(['Take A']);
      expect(first.title).toBe('Paper Lantern');
      expect(first.blurb).toContain('album in the making');
      expect(first.html).toContain('id="album-root"');
      expect(first.html).not.toMatch(/internet required|streams from a public Suno link/i);
      expect(first.html).not.toContain('Album Bot Light');

      const second = await recordTake(root, 'b');
      expect(takeLabels(second)).toEqual(['Take A', 'Take B']);
      expect(takeId(second, 'Take A')).toBe(takeId(first, 'Take A'));
      expect(second.blurb).toContain('album in the making');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function recordTake(root: string, letter: string): Promise<ShellAlbum> {
  const clipId = `fixture-1-${letter}`;
  const filename = `v1-01-paper-lantern-p1-take${letter}.mp3`;
  const receipt = path.join(root, `${clipId}.json`);
  await writeFile(
    receipt,
    JSON.stringify({
      filename,
      clipId,
      streamUrl: `https://cdn1.suno.ai/${clipId}.mp4`,
    })
  );
  const stdout = execFileSync(
    process.execPath,
    [path.resolve('scripts/preview-album.mjs'), '--record', receipt],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    }
  );
  const line = stdout
    .trim()
    .split('\n')
    .find(function (item) {
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
  return { html, ...readShell(html) };
}

type ShellTake = { id: string; label: string };

type ShellAlbum = {
  html: string;
  title: string;
  blurb: string;
  takes: ShellTake[];
};

function readShell(html: string): Omit<ShellAlbum, 'html'> {
  const page = new DOMParser().parseFromString(html, 'text/html');
  const raw = page.querySelector('#album-data')?.textContent;
  if (raw === undefined || raw === null || raw.length === 0) {
    throw new Error('The listen shell has no album data.');
  }
  const payload: unknown = JSON.parse(raw);
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Album data was not an object.');
  }
  if (!('title' in payload) || typeof payload.title !== 'string') {
    throw new Error('Album data has no title.');
  }
  if (!('blurb' in payload) || typeof payload.blurb !== 'string') {
    throw new Error('Album data has no blurb.');
  }
  if (!('version' in payload) || typeof payload.version !== 'object' || payload.version === null) {
    throw new Error('Album data has no version.');
  }
  if (!('tracks' in payload.version) || !Array.isArray(payload.version.tracks)) {
    throw new Error('Album data has no tracks.');
  }
  const takes: ShellTake[] = [];
  for (const track of payload.version.tracks) {
    if (typeof track !== 'object' || track === null || !('takes' in track)) continue;
    if (!Array.isArray(track.takes)) continue;
    for (const take of track.takes) {
      if (typeof take !== 'object' || take === null) continue;
      if (!('filename' in take) || typeof take.filename !== 'string') continue;
      if (!('label' in take) || typeof take.label !== 'string') continue;
      takes.push({ id: take.filename, label: `Take ${take.label}` });
    }
  }
  return { title: payload.title, blurb: payload.blurb, takes };
}

function takeLabels(album: ShellAlbum): string[] {
  const labels: string[] = [];
  for (const take of album.takes) labels.push(take.label);
  return labels;
}

function takeId(album: ShellAlbum, label: string): string {
  for (const take of album.takes) {
    if (take.label === label) return take.id;
  }
  throw new Error(`Missing ${label}`);
}
