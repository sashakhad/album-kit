import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

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
