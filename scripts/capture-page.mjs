import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BROWSERS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

/** Chrome is not allowed to hold the page. A stalled screenshot dies on its own. */
export const CAPTURE_TIMEOUT_SECONDS = 3;

function browserBin() {
  for (const name of BROWSERS) {
    const found = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
    const bin = found.stdout.trim();
    if (found.status === 0 && bin.length > 0) return bin;
  }
  return null;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

/**
 * Start a screenshot and return immediately. The page is already on disk.
 * Tests skip the browser. A missing browser skips the picture.
 */
export function captureAlbumPage(htmlPath, pngPath) {
  if (process.env.VITEST === 'true') return null;
  const bin = browserBin();
  if (bin === null) return null;
  const profile = mkdtempSync(path.join(tmpdir(), 'album-page-shot-'));
  const command = [
    'timeout',
    String(CAPTURE_TIMEOUT_SECONDS),
    shellQuote(bin),
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--virtual-time-budget=2000',
    '--window-size=480,800',
    shellQuote(`--user-data-dir=${profile}`),
    shellQuote(`--screenshot=${pngPath}`),
    shellQuote(`file://${htmlPath}`),
    ';',
    'rm',
    '-rf',
    shellQuote(profile),
  ].join(' ');
  const child = spawn('bash', ['-lc', command], { detached: true, stdio: 'ignore' });
  child.unref();
  return null;
}
