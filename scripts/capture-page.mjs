import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BROWSERS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

function browserBin() {
  for (const name of BROWSERS) {
    const found = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
    const bin = found.stdout.trim();
    if (found.status === 0 && bin.length > 0) return bin;
  }
  return null;
}

export async function captureAlbumPage(htmlPath, pngPath) {
  if (process.env.VITEST === 'true') return null;
  const bin = browserBin();
  if (bin === null) return null;
  const profile = await mkdtemp(path.join(tmpdir(), 'album-page-shot-'));
  try {
    const shot = spawnSync(
      bin,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--virtual-time-budget=4000',
        '--window-size=480,800',
        `--user-data-dir=${profile}`,
        `--screenshot=${pngPath}`,
        `file://${htmlPath}`,
      ],
      { timeout: 20_000 }
    );
    if (shot.status !== 0) return null;
    const info = await stat(pngPath);
    if (info.size < 1000) return null;
    return pngPath;
  } catch {
    return null;
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}
