import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AlbumConfig } from '@/lib/album/album-config';
import { parseTrackNumber } from '@/lib/album/parse-filename';
import { defaultAlbumRoot } from '@/lib/album/paths';

export function parseSheetPrompts(markdown: string): Map<string, string> {
  const headings = [...markdown.matchAll(/^##\s+([^\n]+)$/gm)];
  const prompts = new Map<string, string>();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const id = /^p\d+\b/i.exec(heading?.[1]?.trim() ?? '')?.[0]?.toLowerCase();
    if (id === undefined || heading?.index === undefined) continue;
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    const text = markdown.slice(start, end).trim();
    if (text.length > 0) prompts.set(id, text);
  }
  return prompts;
}

export async function loadTakePrompts(
  config: AlbumConfig,
  filenames: readonly string[]
): Promise<Map<string, string>> {
  const byTrack = new Map<number, Map<string, string>>();
  await Promise.all(
    config.tracks.map(async track => {
      const file = path.join(
        defaultAlbumRoot(),
        'tracks',
        `${String(track.number).padStart(2, '0')}-${track.slug}.md`
      );
      try {
        byTrack.set(track.number, parseSheetPrompts(await fs.readFile(file, 'utf8')));
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
    })
  );
  const prompts = new Map<string, string>();
  for (const filename of filenames) {
    const trackNumber = parseTrackNumber(filename);
    const promptId = /-(p\d+)-take[a-z]{1,2}\.mp3$/i.exec(filename)?.[1]?.toLowerCase();
    if (trackNumber === null || promptId === undefined) continue;
    const prompt = byTrack.get(trackNumber)?.get(promptId);
    if (prompt !== undefined) prompts.set(filename, prompt);
  }
  return prompts;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
