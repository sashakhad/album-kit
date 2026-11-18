#!/usr/bin/env node
/**
 * Proves Open Album.html plays when every remote request is aborted.
 * Not part of CI. Run: node --experimental-strip-types scripts/prove-viewer-playback.mjs
 */
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { embedPublicAudio } from '../src/lib/album/embed-public-audio.ts';

const run = promisify(execFile);
const STREAM = 'https://cdn1.suno.ai/toneclip.mp4';

const root = await mkdtemp(path.join(tmpdir(), 'viewer-proof-'));
const chromeDir = await mkdtemp(path.join(tmpdir(), 'viewer-chrome-'));
let chrome = null;
try {
  const tone = path.join(root, 'tone.m4a');
  await run('ffmpeg', [
    '-nostdin',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=2',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    tone,
  ]);
  const bytes = await readFile(tone);
  await mkdir(path.join(root, 'album'), { recursive: true });
  await mkdir(path.join(root, '.tmp'), { recursive: true });
  await writeFile(
    path.join(root, 'album/album.json'),
    JSON.stringify({
      title: 'Tone Album',
      artist: 'Album Bot',
      sets: [{ id: 'v1', name: 'First' }],
      tracks: [{ number: 1, title: 'Tone Song', slug: 'tone-song' }],
    })
  );
  await writeFile(
    path.join(root, '.tmp/album-preview-streams.json'),
    JSON.stringify([
      { filename: 'v1-01-tone-song-p1-takea.mp3', clipId: 'toneclip', streamUrl: STREAM },
    ])
  );
  await embedPublicAudio({
    url: STREAM,
    cacheDir: path.join(root, '.tmp', 'album-preview-embedded'),
    allowNetwork: true,
    ffmpegBin: null,
    fetchImpl: () =>
      Promise.resolve({
        status: 200,
        headers: {
          get(name) {
            return name.toLowerCase() === 'content-type' ? 'audio/mp4' : String(bytes.length);
          },
        },
        arrayBuffer: () => Promise.resolve(Uint8Array.from(bytes).buffer),
      }),
  });
  const output = await run(
    process.execPath,
    [
      '--experimental-strip-types',
      path.join(process.cwd(), 'scripts/preview-album.mjs'),
      '--streams-only',
    ],
    { cwd: root, encoding: 'utf8' }
  );
  const text = typeof output.stdout === 'string' ? output.stdout : String(output.stdout ?? output);
  const line = text
    .trim()
    .split('\n')
    .find(item => item.startsWith('{'));
  if (line === undefined) throw new Error(`preview did not print JSON: ${text}`);
  const report = JSON.parse(line);
  const html = await readFile(report.link, 'utf8');
  const blocked = await playInBlockedViewer(report.link);
  const stripped = html.replace(
    /,"embeddedAudio":\{"mime":"audio\/mp4","base64":"[A-Za-z0-9+/=]+"\}/g,
    ''
  );
  const controlPage = path.join(root, 'control.html');
  await writeFile(controlPage, stripped);
  const control = await playInBlockedViewer(controlPage);
  const proof = {
    embeddedBytes: bytes.length,
    htmlBytes: Buffer.byteLength(html),
    blockedRemoteProbe: blocked.probe,
    embedded: {
      currentTime: blocked.currentTime,
      src: blocked.src,
      error: blocked.error,
      paused: blocked.paused,
    },
    withoutEmbedded: {
      currentTime: control.currentTime,
      src: control.src,
      error: control.error,
      text: control.text,
    },
  };
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  const remoteBlocked =
    blocked.probe.fetched.startsWith('TypeError') &&
    (blocked.probe.media.code === 4 ||
      blocked.probe.media.code === 2 ||
      blocked.probe.media.message);
  if (!remoteBlocked) throw new Error('The harness did not reject remote media and fetch.');
  if (!(blocked.currentTime > 0.2)) throw new Error('Embedded audio did not advance currentTime.');
  if (!String(blocked.src).startsWith('blob:')) throw new Error('Playback did not use a blob URL.');
  if (control.currentTime > 0.05) {
    throw new Error('The control page played a remote stream. Request blocking did not hold.');
  }
} finally {
  if (chrome !== null) chrome.kill('SIGKILL');
  await rm(root, { recursive: true, force: true });
  await rm(chromeDir, { recursive: true, force: true });
}

async function playInBlockedViewer(file) {
  const session = await launchChrome();
  chrome = session.chrome;
  const page = await connect(session.port);
  const blocked = [];
  page.on('Fetch.requestPaused', params => {
    const url = params.request.url;
    if (url.startsWith('http:') || url.startsWith('https:')) {
      blocked.push(url);
      void page.send('Fetch.failRequest', {
        requestId: params.requestId,
        errorReason: 'BlockedByClient',
      });
      return;
    }
    void page.send('Fetch.continueRequest', { requestId: params.requestId });
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await page.send('Page.enable');
  const loaded = page.wait('Page.loadEventFired');
  await page.send('Page.navigate', { url: pathToFileURL(file).href });
  await loaded;
  await page.waitFor(
    `document.querySelector('h1') && document.querySelector('h1').textContent === 'Tone Album'`
  );
  const probe = await page.evaluate(`(async () => {
    const media = await new Promise(resolve => {
      const video = document.createElement('video');
      const finish = () => resolve({
        code: video.error ? video.error.code : null,
        message: video.error ? video.error.message : '',
      });
      video.addEventListener('error', finish, { once: true });
      video.src = ${JSON.stringify(STREAM)};
      setTimeout(finish, 1500);
    });
    let fetched = 'ok';
    try {
      await fetch(${JSON.stringify(STREAM)});
    } catch (error) {
      fetched = error.name + ': ' + error.message;
    }
    return { media, fetched };
  })()`);
  const box = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => /tone song/i.test(item.textContent || ''));
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + Math.min(rect.height / 2, 20) };
  })()`);
  if (box === null) throw new Error('The track button was not on the page.');
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: box.x,
    y: box.y,
    button: 'left',
    clickCount: 1,
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: box.x,
    y: box.y,
    button: 'left',
    clickCount: 1,
  });
  let sample = { currentTime: 0, src: '', paused: true, error: '' };
  const started = Date.now();
  while (Date.now() - started < 4000) {
    sample = await page.evaluate(`(() => {
      const media = [...document.querySelectorAll('audio, video')].find(item => item.getAttribute('src'));
      const alert = document.querySelector('[role="alert"]');
      return {
        currentTime: media ? media.currentTime : 0,
        src: media ? (media.getAttribute('src') || '').slice(0, 48) : '',
        paused: media ? media.paused : true,
        error: alert ? alert.textContent : '',
      };
    })()`);
    if (sample.currentTime > 0.2) break;
    await delay(200);
  }
  const text = await page.evaluate(`document.body.innerText.slice(0, 500)`);
  page.close();
  session.chrome.kill('SIGKILL');
  chrome = null;
  await rm(session.dir, { recursive: true, force: true });
  return { ...sample, probe, blocked: blocked.slice(0, 8), text };
}

async function launchChrome() {
  const dir = await mkdtemp(path.join(tmpdir(), 'viewer-chrome-'));
  const child = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--disable-background-networking',
      `--user-data-dir=${dir}`,
      '--remote-debugging-port=0',
      '--window-size=1280,800',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const port = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(
      () => reject(new Error(`Chrome did not open a port.\n${buffer}`)),
      15000
    );
    const take = chunk => {
      buffer += chunk.toString();
      const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited ${String(code)}.\n${buffer}`));
    });
  });
  return { chrome: child, port, dir };
}

async function connect(port) {
  const list = await fetch(`http://127.0.0.1:${String(port)}/json`).then(response =>
    response.json()
  );
  const page = list.find(item => item.type === 'page');
  if (page === undefined) throw new Error('Chrome did not open a page.');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('DevTools socket failed.')));
  });
  let next = 0;
  const pending = new Map();
  const waits = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (typeof message.id === 'number' && pending.has(message.id)) {
      const settle = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) settle.reject(new Error(JSON.stringify(message.error)));
      else settle.resolve(message.result);
      return;
    }
    if (typeof message.method === 'string') {
      for (const wait of waits) {
        if (wait.method === message.method) wait.resolve(message.params);
      }
    }
  });
  return {
    send(method, params) {
      const id = ++next;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    wait(method) {
      return new Promise(resolve => {
        waits.push({ method, resolve });
      });
    },
    on(method, handle) {
      waits.push({
        method,
        resolve(params) {
          handle(params);
        },
      });
    },
    async evaluate(expression) {
      const result = await this.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result.exceptionDetails));
      }
      return result.result.value;
    },
    async waitFor(expression) {
      const started = Date.now();
      while (Date.now() - started < 8000) {
        const ready = await this.evaluate(`Boolean(${expression})`);
        if (ready === true) return;
        await delay(100);
      }
      throw new Error(`Timed out waiting for ${expression}`);
    },
    close() {
      ws.close();
    },
  };
}

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
