// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const onboarding = path.join(root, 'scripts', 'onboarding.mjs');

describe('Lite branding', () => {
  let album: string;

  beforeEach(async () => {
    album = await mkdtemp(path.join(os.tmpdir(), 'album-lite-branding-'));
  });

  afterEach(async () => {
    await rm(album, { recursive: true, force: true });
  });

  function run(...args: string[]): string {
    const result = spawnSync(process.execPath, [onboarding, ...args], {
      cwd: album,
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('Album Bot Light');
    expect(result.stdout).not.toContain('five Cursor models');
    expect(result.stdout).not.toMatch(/streams from a public Suno link/i);
    return result.stdout;
  }

  it('asks a fresh album to choose Lite and describes five prompt writers before Cursor', () => {
    const status = run('status');
    expect(status).toContain('Onboarding 0/2 · Choose your setup');
    expect(status).toContain(
      'Next: Choose Album Bot Lite for a quick local album. In Full Setup, up to five different AI models write prompts for the same track so you can compare their takes.'
    );
  });

  it('keeps a saved light checkpoint and accepts the lite spelling', async () => {
    const checkpoint = path.join(album, '.album-onboarding.json');
    await writeFile(checkpoint, JSON.stringify({ path: 'light', suno: { method: 'browser' } }));

    const existing = run('status');
    expect(existing).toContain('Onboarding 0/2 · Album Bot Lite');
    expect(JSON.parse(await readFile(checkpoint, 'utf8'))).toEqual({
      path: 'light',
      suno: { method: 'browser' },
    });

    const spelled = run('path', 'lite');
    expect(spelled).toContain('Onboarding 0/2 · Album Bot Lite');
    expect(JSON.parse(await readFile(checkpoint, 'utf8'))).toEqual({
      path: 'light',
      suno: { method: 'browser' },
    });
  });
});
