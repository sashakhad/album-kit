import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { renderAlbumPagePng } from '../../../scripts/page-preview.mjs';
import {
  deliverySay,
  firstOnesIn,
  generationEstimate,
  hearPage,
  nextTracksLine,
  shareCard,
  startGeneration,
  tapToListen,
  trackProgressLine,
} from '../../../scripts/live-progress.mjs';

it('prints the measured estimate and refuses the share card until a later message', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'live-progress-'));
  try {
    const started = await startGeneration(root);
    expect(started.say).toBe(generationEstimate);
    expect(started.shareCard).toBe(false);

    await expect(shareCard(root)).resolves.toMatchObject({ shareCard: false, say: tapToListen });
    await expect(hearPage(root)).rejects.toThrow(/album page/);

    const page = deliverySay({
      first: true,
      pendingTracks: true,
      landedLabel: trackProgressLine(1, ['A', 'B']),
    });
    expect(page.startsWith(tapToListen)).toBe(true);
    expect(page).toContain(firstOnesIn);
    expect(page).toContain('Track 1, takes A and B are in.');
    expect(page).toContain(nextTracksLine);

    const cli = execFileSync(
      process.execPath,
      [path.resolve('scripts/live-progress.mjs'), 'start'],
      { cwd: root, encoding: 'utf8' }
    );
    expect(JSON.parse(cli).say).toBe(generationEstimate);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('draws a png preview of the listen page', async () => {
  const png = renderAlbumPagePng({
    title: 'Harbor Lines',
    tracks: [
      { title: 'First Light', letters: ['A'] },
      { title: 'Glass Harbor', letters: ['A', 'B'] },
    ],
  });
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.length).toBeGreaterThan(500);
  const root = await mkdtemp(path.join(tmpdir(), 'page-preview-'));
  try {
    const file = path.join(root, 'Album page.png');
    await writeFile(file, png);
    const saved = await readFile(file);
    expect(saved.equals(png)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
