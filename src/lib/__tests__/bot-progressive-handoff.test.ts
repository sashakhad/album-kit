import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

type ShellTake = { src: string; id: string; title: string; label: string };

function shellTakes(html: string): ShellTake[] {
  const raw = html.match(
    /<script type="application\/json" id="album-data">([\s\S]*?)<\/script>/
  )?.[1];
  if (raw === undefined) throw new Error('The listen shell has no album data.');
  const payload = JSON.parse(raw) as {
    version: {
      tracks: { title: string; takes: { filename: string; audioUrl: string; label: string }[] }[];
    };
  };
  const takes: ShellTake[] = [];
  for (const track of payload.version.tracks) {
    for (const take of track.takes) {
      takes.push({
        src: take.audioUrl,
        id: take.filename,
        title: track.title,
        label: `Take ${take.label}`,
      });
    }
  }
  return takes;
}

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
    const attachments: ShellTake[][] = [];
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
      expect(path.basename(report.page)).toBe('Open Album.html');
      expect(report.link).toMatch(/^https:\/\/album-bot-site\.vercel\.app\/a#/);
      if (typeof report.preview === 'string') {
        expect(path.basename(report.preview)).toBe('Album page.png');
        expect(path.dirname(report.preview)).not.toBe(path.dirname(report.page));
      }
      expect(report.shareCard).toBe(false);
      expect(report.say.startsWith('Your album page is ready. Tap to listen ↓')).toBe(true);
      // Capture the exact file bytes the bot can attach before making the next
      // receipt available. No chat connector or remote audio request is involved.
      const html = await readFile(report.page, 'utf8');
      const takes = shellTakes(html);
      expect(takes).toHaveLength(received.size);
      const seen = new Set<string>();
      for (const take of takes) {
        expect(received.get(take.src)).toEqual({ title: take.title, label: take.label });
        expect(seen.has(take.src)).toBe(false);
        seen.add(take.src);
        if (stableIds.has(take.src)) {
          expect(take.id).toBe(stableIds.get(take.src));
        } else {
          stableIds.set(take.src, take.id);
        }
      }
      expect(html).not.toContain(filename);
      attachments.push(takes);
    }
    const playable = (takes: ShellTake[]) => new Set(takes.map(take => take.title));
    expect(playable(attachments[0]!)).toEqual(new Set(['Signal Tower']));
    expect(playable(attachments[4]!).size).toBe(5);
    expect(attachments.at(-1)!).toHaveLength(10);
    expect(new Set(stableIds.values()).size).toBe(10);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
