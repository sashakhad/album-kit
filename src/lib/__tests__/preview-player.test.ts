// @vitest-environment-options {"url":"https://my-album.example/"}
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { afterEach, expect, it, vi } from 'vitest';

const pages = new Map<string, string>();
const request = vi.fn();

function fixturePage(title: string) {
  const cached = pages.get(title);
  if (cached) return cached;
  const root = mkdtempSync(path.join(os.tmpdir(), 'preview-player-'));
  try {
    mkdirSync(path.join(root, 'album/audio'), { recursive: true });
    mkdirSync(path.join(root, '.tmp'));
    writeFileSync(
      path.join(root, 'album/album.json'),
      JSON.stringify({
        title,
        sets: [{ id: 'v1', name: 'First' }],
        tracks: [{ number: 1, title: 'First song', slug: 'first-song' }],
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
      ])
    );
    const html = renderPage(root);
    pages.set(title, html);
    return html;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function renderPage(root: string) {
  const script = path.join(process.cwd(), 'scripts/preview-album.mjs');
  const report = JSON.parse(
    execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
  );
  return readFileSync(report.page, 'utf8');
}

function openPlayer(title: string, address = window.location.href) {
  mountPage(fixturePage(title), address);
}

function mountPage(html: string, address = window.location.href) {
  const page = new DOMParser().parseFromString(html, 'text/html');
  const script = page.querySelector('script');
  if (!script) throw new Error('The album player has no script.');
  script.remove();
  document.body.replaceChildren(...Array.from(page.body.children));
  runInNewContext(script.textContent, {
    document,
    navigator: window.navigator,
    location: new URL(address),
    localStorage: window.localStorage,
    fetch: request,
  });
}

async function upvote() {
  document.querySelector<HTMLButtonElement>('#upvote')?.click();
  await vi.waitFor(() => expect(document.querySelector('#take-score')).toHaveTextContent('+1'));
}

afterEach(() => {
  window.localStorage.clear();
  request.mockReset();
  vi.restoreAllMocks();
});

it('lets a visitor play and rate a shared album, keeping their scores across visits on this browser', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  openPlayer('first-album');
  expect(window.location.protocol).toBe('https:');
  expect(document.querySelector('#ballot')).toBeVisible();
  expect(document.querySelector('#vote-storage')).toBeEmptyDOMElement();
  document.querySelector<HTMLButtonElement>('#play')?.click();
  expect(play).toHaveBeenCalledOnce();
  await upvote();
  expect(document.querySelector('#vote-status')).toBeEmptyDOMElement();
  openPlayer('another-album');
  expect(document.querySelector('#take-score')).toHaveTextContent(/^0$/);
  openPlayer('first-album');
  expect(document.querySelector('#take-score')).toHaveTextContent('+1');
  expect(request).not.toHaveBeenCalled();
});

it('keeps rating available for the visit if the browser blocks saving', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage blocked');
  });
  openPlayer('first-album');
  await upvote();
  expect(document.querySelector('#vote-storage')).toHaveTextContent('close or reload');
  expect(request).not.toHaveBeenCalled();
});

it('shows a connection hint only after a remote take fails to play offline', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('Network unavailable'));
  openPlayer('first-album');
  document.querySelector<HTMLButtonElement>('[data-take][data-label="Take B"]')?.click();
  expect(document.querySelector('#take-label')).toHaveTextContent(/^Take B$/);
  expect(document.querySelector('#playback-error')).toBeEmptyDOMElement();
  document.querySelector<HTMLButtonElement>('#play')?.click();
  await vi.waitFor(() =>
    expect(document.querySelector('#playback-error')).toHaveTextContent('Reconnect and press Play')
  );
  document.querySelector<HTMLButtonElement>('[data-take][data-label="Take A"]')?.click();
  expect(document.querySelector('#playback-error')).toBeEmptyDOMElement();
});

it('sends votes to the disk-backed ballot on the local preview server', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  request
    .mockResolvedValueOnce(Response.json({ votes: {} }))
    .mockImplementationOnce((_url, options) => {
      const { take } = JSON.parse(options.body);
      return Promise.resolve(Response.json({ votes: { [take]: 1 } }));
    });
  openPlayer('first-album', 'http://127.0.0.1:35121/');
  await vi.waitFor(() => expect(document.querySelector('#ballot')).toBeVisible());
  await upvote();
  expect(request).toHaveBeenNthCalledWith(1, '/ballot');
  expect(request).toHaveBeenNthCalledWith(2, '/ballot', expect.objectContaining({ method: 'PUT' }));
  expect(window.localStorage.length).toBe(0);
});

it('rates any row while another take plays, restores the ballot, and retires a whole row between passes', async () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const file = 'file:///test/Open%20Album.html';
  openPlayer('first-album', file);
  const row = (label: string) => {
    const button = document.querySelector<HTMLButtonElement>(
      `button[data-take][data-label="Take ${label}"]`
    );
    return button!.closest<HTMLElement>('.take-row')!;
  };
  const adjust = (letter: string, direction: 'Raise' | 'Lower') => {
    const name = `${direction} score for First song, Take ${letter}`;
    const button = row(letter).querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
    expect(button).toHaveAccessibleName(name);
    button!.click();
  };
  const checkScore = (letter: string, value: string) =>
    expect(row(letter).querySelector('.take-score')?.textContent).toBe(value);
  expect(row('A').querySelector('[data-take]')).toHaveAttribute('aria-pressed', 'true');
  document.querySelector<HTMLButtonElement>('#play')!.click();
  const audio = document.querySelector('audio')!;
  const source = audio.src;
  audio.currentTime = 17;
  pause.mockClear();
  adjust('B', 'Lower');
  await vi.waitFor(() => checkScore('B', '-1'));
  expect(document.querySelector('#take-score')).toHaveTextContent(/^0$/);
  expect(document.querySelector('#take-label')).toHaveTextContent('Take A');
  expect(audio.src).toBe(source);
  expect(audio.currentTime).toBe(17);
  expect(pause).not.toHaveBeenCalled();
  expect(play).toHaveBeenCalledOnce();
  adjust('A', 'Raise');
  await vi.waitFor(() => checkScore('A', '+1'));
  expect(document.querySelector('#take-score')).toHaveTextContent('+1');
  document.querySelector<HTMLButtonElement>('#upvote')!.click();
  await vi.waitFor(() => expect(document.querySelector('#take-score')).toHaveTextContent('+2'));
  checkScore('A', '+2');
  openPlayer('first-album', file);
  expect(row('A').querySelector('[data-take]')).toHaveAttribute('aria-pressed', 'true');
  expect(document.querySelector('#take-score')).toHaveTextContent('+2');
  checkScore('B', '-1');
  document.querySelector<HTMLButtonElement>('#next-pass')!.click();
  await vi.waitFor(() => expect(row('B')).not.toBeVisible());
  expect(row('A')).toBeVisible();
  expect(document.querySelector('#vote-progress')).toHaveTextContent('1 of 1');
  expect(request).not.toHaveBeenCalled();
});

it('sends an unselected row vote to the loopback ballot without moving playback', async () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  request.mockResolvedValueOnce(Response.json({ votes: {} }));
  openPlayer('first-album', 'http://127.0.0.1:35121/');
  await vi.waitFor(() => expect(document.querySelector('#ballot')).toBeVisible());
  const button = document.querySelector<HTMLButtonElement>(
    '[aria-label="Raise score for First song, Take B"]'
  )!;
  const id = button.closest<HTMLElement>('.take-row')!.dataset.takeId!;
  request.mockResolvedValueOnce(Response.json({ votes: { [id]: 1 } }));
  pause.mockClear();
  button.click();
  await vi.waitFor(() =>
    expect(button.closest('.take-row')?.querySelector('.take-score')).toHaveTextContent('+1')
  );
  expect(JSON.parse(request.mock.calls[1]![1].body)).toMatchObject({
    take: id,
    vote: 1,
    select: false,
  });
  expect(document.querySelector('#take-label')).toHaveTextContent('Take A');
  expect(document.querySelector('#take-score')).toHaveTextContent(/^0$/);
  expect(pause).not.toHaveBeenCalled();
  expect(window.localStorage.length).toBe(0);
});

it('keeps a pre-upgrade browser ballot through appended songs and isolates a fresh album of the same name', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const title = 'Night Shift';
  const albums = [1, 2].map(() => mkdtempSync(path.join(os.tmpdir(), 'append-songs-')));
  const [first, fresh] = albums as [string, string];
  const tracks = [{ number: 1, title: 'First', slug: 'first' }];
  const digest = (s: string) => createHash('sha256').update(s).digest('hex');
  const firstTake = 'v1-01-first-p1-takea.mp3';
  const id = digest(firstTake).slice(0, 24);
  const oldKey = digest(JSON.stringify({ title, tracks: [[1, 'first']] })).slice(0, 16);
  const prefix = 'album-kit-preview-ballot-';
  const saveTracks = (root: string) =>
    writeFileSync(
      path.join(root, 'album/album.json'),
      JSON.stringify({ title, sets: [{ id: 'v1' }], tracks })
    );
  try {
    for (const root of albums) {
      mkdirSync(path.join(root, 'album/audio'), { recursive: true });
      writeFileSync(path.join(root, 'album/audio', firstTake), 'audio');
      saveTracks(root);
    }
    const oldStandalone = path.join(first, '.tmp/album-preview-online');
    mkdirSync(oldStandalone, { recursive: true });
    writeFileSync(
      path.join(oldStandalone, 'Open Album.html'),
      `<script>const albumKey = "${oldKey}";</script>`
    );
    localStorage.setItem(
      prefix + oldKey,
      JSON.stringify({ albumKey: oldKey, pass: 2, selected: id, votes: { [id]: 3 }, retired: [] })
    );
    tracks.push({ number: 2, title: 'Encore', slug: 'encore' });
    saveTracks(first);
    writeFileSync(path.join(first, 'album/audio/v1-02-encore-p1-takea.mp3'), 'new song');
    mountPage(renderPage(first));
    expect(document.querySelector('#pass-label')).toHaveTextContent('Pass 2');
    expect(document.querySelector('#take-score')).toHaveTextContent('+3');
    expect(document.querySelector('[aria-label="Score for Encore, Take A"]')).toHaveTextContent(
      /^0$/
    );
    mountPage(renderPage(fresh));
    expect(document.querySelector('#pass-label')).toHaveTextContent('Pass 1');
    expect(document.querySelector('#take-score')).toHaveTextContent(/^0$/);
  } finally {
    for (const root of albums) rmSync(root, { recursive: true, force: true });
  }
});

it('recovers a matching browser-only ballot once after re-exporting an older album', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const title = 'Browser migration';
  const digest = (text: string) => createHash('sha256').update(text).digest('hex');
  const oldKey = digest(JSON.stringify({ title, tracks: [[1, 'first-song']] })).slice(0, 16);
  const id = digest('v1-01-first-song-p1-takea.mp3').slice(0, 24);
  localStorage.setItem(
    `album-kit-preview-ballot-${oldKey}`,
    JSON.stringify({
      albumKey: oldKey,
      pass: 3,
      selected: id,
      votes: { [id]: 2 },
      retired: [],
    })
  );
  const original = fixturePage(title);
  mountPage(original);
  expect(document.querySelector('#pass-label')).toHaveTextContent('Pass 3');
  expect(document.querySelector('#take-score')).toHaveTextContent('+2');
  pages.delete(title);
  openPlayer(title);
  expect(document.querySelector('#pass-label')).toHaveTextContent('Pass 1');
  expect(document.querySelector('#take-score')).toHaveTextContent(/^0$/);
  mountPage(original);
  expect(document.querySelector('#take-score')).toHaveTextContent('+2');
});
