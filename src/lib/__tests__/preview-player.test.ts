// @vitest-environment-options {"url":"https://my-album.example/"}
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { afterEach, expect, it, vi } from 'vitest';

const template = readFileSync(path.join(process.cwd(), 'scripts/album-preview.html'), 'utf8');
const request = vi.fn();

function openPlayer(albumKey: string, address = window.location.href) {
  const track = `<section class="track"><div class="takes"><button data-kind="audio"
    data-id="first" data-src="audio/first.mp3" data-title="First song" data-label="Take A"
    data-online="false">Take A <small data-score>0</small></button></div></section>`;
  const html = template
    .replace('{{tracks}}', track)
    .replace('{{albumKey}}', JSON.stringify(albumKey));
  const page = new DOMParser().parseFromString(html, 'text/html');
  const script = page.querySelector('script');
  if (!script) throw new Error('The album player has no script.');
  script.remove();
  document.body.replaceChildren(...Array.from(page.body.children));
  runInNewContext(script.textContent, {
    document,
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
  expect(document.querySelector('#vote-storage')).toHaveTextContent('Scores stay in this browser');
  document.querySelector<HTMLButtonElement>('#play')?.click();
  expect(play).toHaveBeenCalledOnce();
  await upvote();
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
  expect(document.querySelector('#vote-storage')).toHaveTextContent('until you close or reload');
  expect(request).not.toHaveBeenCalled();
});

it('sends votes to the disk-backed ballot on the local preview server', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  request
    .mockResolvedValueOnce(Response.json({ votes: {} }))
    .mockResolvedValueOnce(Response.json({ votes: { first: 1 } }));
  openPlayer('first-album', 'http://127.0.0.1:35121/');
  await vi.waitFor(() => expect(document.querySelector('#ballot')).toBeVisible());
  await upvote();
  expect(request).toHaveBeenNthCalledWith(1, '/ballot');
  expect(request).toHaveBeenNthCalledWith(2, '/ballot', expect.objectContaining({ method: 'PUT' }));
  expect(window.localStorage.length).toBe(0);
});
