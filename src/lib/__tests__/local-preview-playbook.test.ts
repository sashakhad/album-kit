import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function text(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), 'utf8');
}

describe('local preview playbook', () => {
  it('makes the local player the first session and forbids shared hosting', async () => {
    const files = [
      'grokbot/BOT.md',
      'README.md',
      '.cursor/skills/start-here/SKILL.md',
      '.cursor/skills/suno-run/SKILL.md',
    ];
    for (const file of files) {
      const body = await text(file);
      expect(body).toContain('Sasha never hosts Album Bot for anyone.');
      expect(body).toContain('Do not ask anyone about shared hosting.');
      expect(body).toContain('pnpm preview:album');
    }

    const bot = await text('grokbot/BOT.md');
    const start = await text('.cursor/skills/start-here/SKILL.md');
    const run = await text('.cursor/skills/suno-run/SKILL.md');
    for (const body of [bot, start, run]) {
      expect(body).toContain(
        "I'll write these songs and make a few takes of each on Suno, then build an album player you can open and listen to right away and vote on locally."
      );
      expect(body).not.toContain('building your own album page');
      expect(body).not.toContain('start site setup in the background');
      expect(body).not.toContain('building their album page');
    }
    expect(bot).toContain('/share');
    expect(start).toContain('/share');
    expect(await text('README.md')).toContain('/share');
  });

  it('keeps the hosted More takes pull path', async () => {
    const bot = await text('grokbot/BOT.md');
    const run = await text('.cursor/skills/suno-run/SKILL.md');
    const finish = await text('.cursor/skills/finish/SKILL.md');
    for (const body of [bot, run]) {
      expect(body).toContain('GET /api/owner/variations/pending');
      expect(body).toContain('/api/owner/variations/claim');
      expect(body).toContain('claimToken');
    }
    expect(finish).toContain('claim that operation');
    expect(await text('.cursor/skills/judge/SKILL.md')).toContain('claim the pending operation');
  });
});
