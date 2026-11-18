import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

const record = path.resolve('scripts/preview-album.mjs');
const trackTitles = ['First Light', 'Glass Harbor', 'Tide Clock', 'Signal Tower', 'Westbound'];
const tracks = trackTitles.map((title, index) => ({
  number: index + 1,
  title,
  slug: title.toLowerCase().replaceAll(' ', '-'),
}));

it('produces the first bot attachment while four songs and the sibling take are pending, then includes every later arrival', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'five-song-handoff-'));
  try {
    await mkdir(path.join(root, 'album'));
    await writeFile(
      path.join(root, 'album/album.json'),
      JSON.stringify({ title: 'Harbor Lines', sets: [{ id: 'v1', name: 'First' }], tracks })
    );

    // Deliver a single provider result at a time. The sibling for the first song
    // to finish is the very last receipt, and album track one arrives fourth.
    const arrivals = [
      [4, 'b'],
      [2, 'a'],
      [5, 'a'],
      [1, 'a'],
      [3, 'a'],
      [1, 'b'],
      [3, 'b'],
      [5, 'b'],
      [2, 'b'],
      [4, 'a'],
    ] as const;
    const received = new Map<string, { title: string; label: string }>();
    const stableIds = new Map<string, string>();
    const attachments: Document[] = [];
    for (const [number, letter] of arrivals) {
      const track = tracks.find(song => song.number === number)!;
      const clipId = `fixture-${number}-${letter}`;
      const filename = `v1-${String(number).padStart(2, '0')}-${track.slug}-p1-take${letter}.mp3`;
      const streamUrl = `https://cdn1.suno.ai/${clipId}.mp4`;
      const receipt = path.join(root, `${clipId}.json`);
      await writeFile(receipt, JSON.stringify({ filename, clipId, streamUrl }));
      received.set(streamUrl, { title: track.title, label: `Take ${letter.toUpperCase()}` });

      const stdout = execFileSync(process.execPath, [record, '--record', receipt], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10_000,
      });
      const report = JSON.parse(stdout);
      expect(report.online).toBe(received.size);
      expect(path.basename(report.link)).toBe('Open Album.html');
      // Capture the exact file bytes the bot can attach before making the next
      // receipt available. No chat connector or remote audio request is involved.
      const html = await readFile(report.link, 'utf8');
      const page = new DOMParser().parseFromString(html, 'text/html');
      const buttons = Array.from(page.querySelectorAll<HTMLButtonElement>('button[data-take]'));
      expect(buttons).toHaveLength(received.size);
      const seen = new Set<string>();
      for (const button of buttons) {
        const { src, id, title, label } = button.dataset;
        if (!src || !id) {
          throw new Error('A take is missing its playable source or vote ID.');
        }
        expect(received.get(src)).toEqual({ title, label });
        expect(seen.has(src)).toBe(false);
        seen.add(src);
        if (stableIds.has(src)) {
          expect(id).toBe(stableIds.get(src));
        } else {
          stableIds.set(src, id);
        }
      }
      expect(html).not.toContain(filename);
      attachments.push(page);
    }
    const playableTracks = (page: Document) => page.querySelectorAll('.track:has([data-take])');
    expect(playableTracks(attachments[0]!)).toHaveLength(1);
    expect(attachments[0]!.querySelector('[data-take]')?.getAttribute('data-title')).toBe(
      'Signal Tower'
    );
    expect(playableTracks(attachments[4]!)).toHaveLength(5);
    expect(attachments.at(-1)!.querySelectorAll('[data-take]')).toHaveLength(10);
    expect(new Set(stableIds.values()).size).toBe(10);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
