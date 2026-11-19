// @vitest-environment-options {"url":"https://my-album.example/"}
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, expect, it } from 'vitest';

import { embedPublicAudio } from '@/lib/album/embed-public-audio';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function renderPage(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preview-player-'));
  roots.push(root);
  mkdirSync(path.join(root, 'album/audio'), { recursive: true });
  mkdirSync(path.join(root, '.tmp'));
  writeFileSync(
    path.join(root, 'album/album.json'),
    JSON.stringify({
      title: 'First album',
      artist: 'Album Bot',
      sets: [{ id: 'v1', name: 'First' }],
      tracks: [
        { number: 1, title: 'First song', slug: 'first-song' },
        { number: 2, title: 'Second song', slug: 'second-song' },
      ],
    })
  );
  writeFileSync(path.join(root, 'album/audio/v1-01-first-song-p1-takea.mp3'), 'fixture');
  writeFileSync(
    path.join(root, '.tmp/album-preview-streams.json'),
    JSON.stringify([
      {
        filename: 'v1-01-first-song-p1-takeb.mp3',
        clipId: 'clipB',
        streamUrl: 'https://cdn1.suno.ai/clipB.mp4',
      },
      {
        filename: 'v1-02-second-song-p1-takea.mp3',
        clipId: 'clipC',
        streamUrl: 'https://cdn1.suno.ai/clipC.mp3',
      },
    ])
  );
  const report = JSON.parse(
    execFileSync(
      process.execPath,
      ['--experimental-strip-types', path.join(process.cwd(), 'scripts/preview-album.mjs')],
      {
        cwd: root,
        encoding: 'utf8',
      }
    )
  ) as { page: string };
  return readFileSync(report.page, 'utf8');
}

function openPlayer(html: string) {
  const played: HTMLMediaElement[] = [];
  const sessions = new Map<string, (() => void) | null>();
  const virtualConsole = new VirtualConsole();
  const errors: string[] = [];
  virtualConsole.on('jsdomError', error => {
    errors.push(error instanceof Error ? error.message : String(error));
  });
  const dom = new JSDOM(html, {
    url: 'https://my-album.example/Open%20Album.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      let nextObjectUrl = 0;
      window.URL.createObjectURL = () => {
        nextObjectUrl += 1;
        return `blob:null/${String(nextObjectUrl)}`;
      };
      window.URL.revokeObjectURL = () => undefined;
      window.HTMLMediaElement.prototype.play = function play() {
        played.push(this);
        return Promise.resolve();
      };
      window.HTMLMediaElement.prototype.pause = () => undefined;
      window.HTMLMediaElement.prototype.load = () => undefined;
      Object.defineProperty(window.navigator, 'mediaSession', {
        configurable: true,
        value: {
          metadata: null,
          playbackState: 'none',
          setActionHandler(name: string, handler: (() => void) | null) {
            sessions.set(name, handler);
          },
        },
      });
      window.MediaMetadata = class MediaMetadata {
        constructor(data: unknown) {
          Object.assign(this, data as object);
        }
      } as unknown as typeof MediaMetadata;
    },
  });
  return { dom, played, sessions, errors };
}

it('plays inlined audio from the shell when remote loads are impossible', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preview-player-'));
  roots.push(root);
  mkdirSync(path.join(root, 'album'), { recursive: true });
  mkdirSync(path.join(root, '.tmp'));
  writeFileSync(
    path.join(root, 'album/album.json'),
    JSON.stringify({
      title: 'Inline album',
      artist: 'Album Bot',
      sets: [{ id: 'v1', name: 'First' }],
      tracks: [{ number: 1, title: 'Tone Song', slug: 'tone-song' }],
    })
  );
  const streamUrl = 'https://cdn1.suno.ai/toneclip.mp4';
  writeFileSync(
    path.join(root, '.tmp/album-preview-streams.json'),
    JSON.stringify([
      {
        filename: 'v1-01-tone-song-p1-takea.mp3',
        clipId: 'toneclip',
        streamUrl,
      },
    ])
  );
  const bytes = Buffer.from('inline-tone');
  await embedPublicAudio({
    url: streamUrl,
    cacheDir: path.join(root, '.tmp', 'album-preview-embedded'),
    allowNetwork: true,
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
  const report = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        path.join(process.cwd(), 'scripts/preview-album.mjs'),
        '--streams-only',
      ],
      { cwd: root, encoding: 'utf8' }
    )
  ) as { page: string };
  const html = readFileSync(report.page, 'utf8');
  expect(html).toContain(bytes.toString('base64'));
  const { dom, played, errors } = openPlayer(html);
  const { document } = dom.window;
  await viWait(() => document.querySelector('h1')?.textContent === 'Inline album');
  expect(errors).toEqual([]);
  buttonNamed(document, /tone song/i).click();
  await viWait(() => played.length > 0);
  expect(played[0]?.tagName).toBe('AUDIO');
  expect(played[0]?.getAttribute('src')?.startsWith('blob:')).toBe(true);
  expect(played[0]?.getAttribute('src')).not.toContain('cdn1.suno.ai');
  expect(shownText(document, dom.window.HTMLElement)).not.toMatch(/could not play this track/i);
});

it('plays a track on the first tap and advances like the album page', async () => {
  const html = renderPage();
  expect(html).not.toMatch(/streams from a public Suno link|anyone with that link/i);
  expect(html).toContain('const albumKey = "');
  const { dom, played, sessions, errors } = openPlayer(html);
  const { document, HTMLElement } = dom.window;
  await viWait(() => document.querySelector('h1')?.textContent === 'First album');
  expect(errors).toEqual([]);
  const shown = shownText(document, HTMLElement);
  expect(shown).toContain('First song');
  expect(shown).toContain('Second song');
  expect(shown).not.toMatch(
    /Only negative scores|dropped before|unscored takes|streams from a public Suno link|anyone with that link/i
  );
  expect(shown).toMatch(/internet required/i);
  expect(document.querySelector('[data-pass-status]')).toBeNull();

  const localTake = buttonNamed(document, /^take a$/i);
  expect(localTake.parentElement?.parentElement?.textContent ?? '').not.toMatch(
    /internet required/i
  );
  const streamTake = buttonNamed(document, /^take b$/i);
  expect(streamTake.parentElement?.parentElement?.textContent ?? '').toMatch(/Internet required/);
  expect(shown).not.toMatch(/anyone with that link/i);

  const track = buttonNamed(document, /first song/i);
  track.click();
  await viWait(() => played.length > 0);
  expect(played[0]?.tagName).toBe('AUDIO');
  expect(document.querySelector('audio')?.getAttribute('src')).toMatch(/\.mp3$/);

  const takeB = buttonNamed(document, /^take b$/i);
  takeB.click();
  await viWait(
    () => document.querySelector('video')?.getAttribute('src')?.includes('clipB.mp4') === true
  );
  expect(played.at(-1)?.tagName).toBe('VIDEO');

  const ended = document.querySelector('video');
  ended?.dispatchEvent(new dom.window.Event('ended', { bubbles: true }));
  await viWait(() => document.querySelector('h2')?.textContent === 'Second song');

  expect(sessions.get('nexttrack')).toEqual(expect.any(Function));
  dom.window.document.body.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
  );
  await viWait(() => document.querySelector('h2')?.textContent === 'First song');
  expect(document.querySelector('[role="slider"]')).toBeInstanceOf(HTMLElement);
});

function shownText(document: Document, elementType: typeof HTMLElement): string {
  const clone = document.body.cloneNode(true);
  if (!(clone instanceof elementType)) {
    throw new Error('expected the player body');
  }
  for (const node of clone.querySelectorAll('script, style')) node.remove();
  return clone.textContent ?? '';
}

function buttonNamed(document: Document, name: RegExp): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find(
    item =>
      name.test(item.textContent?.replace(/\s+/g, ' ').trim() ?? '') ||
      name.test(item.getAttribute('aria-label') ?? '')
  );
  if (button === undefined || button.tagName !== 'BUTTON')
    throw new Error(`Missing button ${name}`);
  return button;
}

async function viWait(check: () => boolean) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > 2000) throw new Error('The listen shell did not render in time.');
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}
