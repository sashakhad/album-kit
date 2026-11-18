import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function text(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), 'utf8');
}

describe('local preview playbook', () => {
  it('keeps the first listen local on the creator’s computer', async () => {
    const files = [
      'grokbot/BOT.md',
      'README.md',
      '.cursor/skills/start-here/SKILL.md',
      '.cursor/skills/suno-run/SKILL.md',
    ];
    for (const file of files) {
      const body = await text(file);
      expect(body).toContain('Sasha never hosts Album Bot for anyone.');
      expect(body).toContain('pnpm preview:album');
    }

    const bot = await text('grokbot/BOT.md');
    const start = await text('.cursor/skills/start-here/SKILL.md');
    const run = await text('.cursor/skills/suno-run/SKILL.md');
    for (const body of [bot, start, run]) {
      expect(body).not.toContain('building your own album page');
      expect(body).not.toContain('start site setup in the background');
      expect(body).not.toContain('building their album page');
    }
    expect(bot).toContain('/share');
    expect(start).toContain('/share');
    expect(await text('README.md')).toContain('/share');
  });

  it.each([
    'grokbot/BOT.md',
    '.cursor/skills/start-here/SKILL.md',
    '.cursor/skills/suno-run/SKILL.md',
    'grokbot/PORTABLE.md',
  ])('offers sharing at album completion in %s', async file => {
    const body = await text(file);
    const question = 'Your album is ready. Want to share it with other people?';
    const index = body.indexOf(question);
    expect(index).toBeGreaterThan(0);
    const beforeOffer = body.slice(0, index);
    const afterOffer = body.slice(index + question.length);
    const firstHandoff = beforeOffer.indexOf('node scripts/preview-album.mjs --streams-only');
    expect(firstHandoff).toBeGreaterThan(0);
    const delivery = beforeOffer.slice(firstHandoff, firstHandoff + 550);
    expect(delivery).toMatch(/attach.*Open Album\.html.*directly in chat/i);
    expect(delivery).toContain('under ten seconds from the first playable take');
    expect(beforeOffer.indexOf('pnpm preview:album --zip')).toBeGreaterThan(firstHandoff);
    expect(beforeOffer).toMatch(
      /(?:all|every) requested (?:tracks|take)[^.\n]*?(?:playable|plays)/i
    );
    expect(afterOffer).toMatch(/no (?:answer|or later)|decline/i);
    expect(afterOffer).toContain('pnpm share:album');
    expect(afterOffer).toMatch(/verified public (?:player )?URL/i);
    expect(body.slice(beforeOffer.lastIndexOf('Full Setup'))).toMatch(/ask (?:only )?once\b/i);
    expect(body).not.toContain('Do not offer it in the first session.');
  });

  it('measures the first handoff through the actual chat send', async () => {
    const run = await text('.cursor/skills/suno-run/SKILL.md');
    expect(run).toContain('when Suno first signaled a playable take');
    expect(run).toContain('when the exporter produced the page');
    expect(run).toContain('when the chat host acknowledged sending the attachment');
    expect(run).toContain('mark any unavailable event unmeasured');
  });

  it.each([
    'grokbot/BOT.md',
    'grokbot/PORTABLE.md',
    '.cursor/skills/start-here/SKILL.md',
    '.cursor/skills/suno-run/SKILL.md',
    '.cursor/skills/publish/SKILL.md',
  ])('hands listeners the public Compare takes link in %s', async file => {
    const body = await text(file);
    expect(body).toContain('<site>/vote');
    expect(body).toMatch(/signed.out/i);
    expect(body).not.toMatch(/listener voting (?:stays|is) off|paste the `Owner:` line/i);
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
