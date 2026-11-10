// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseAlbumConfig } from '../album-config';
import { loadTakePrompts, parseSheetPrompts } from '../sheet-prompts';

let root: string | null = null;

afterEach(async () => {
  vi.restoreAllMocks();
  if (root !== null) await rm(root, { recursive: true, force: true });
  root = null;
});

describe('track sheet prompts', () => {
  it('maps each audio take to its own Style prompt', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'album-sheet-'));
    const sheetDir = path.join(root, 'album', 'tracks');
    await mkdir(sheetDir, { recursive: true });
    await writeFile(
      path.join(sheetDir, '01-track-one.md'),
      '# Track One\n\n## p1 — bright\n\nBright house with piano.\n\n## p2 — dark\n\nDark techno with a rolling kick.\n'
    );
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    const config = parseAlbumConfig({
      title: 'Test',
      artist: '',
      genre: '',
      rule: '',
      sets: [{ id: 'v1', name: 'One' }],
      tracks: [{ number: 1, title: 'Track One', slug: 'track-one' }],
    });
    const p1 = 'v1-01-track-one-p1-takea.mp3';
    const p2 = 'v1-01-track-one-p2-takeb.mp3';
    const prompts = await loadTakePrompts(config, [p1, p2]);

    expect(prompts.get(p1)).toBe('Bright house with piano.');
    expect(prompts.get(p2)).toBe('Dark techno with a rolling kick.');
    expect(parseSheetPrompts('## p1 — first\n\nFirst.\n\n## Notes\nNot a prompt.').get('p1')).toBe(
      'First.'
    );
  });
});
