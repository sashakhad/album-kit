// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const onboarding = fileURLToPath(new URL('../../../scripts/onboarding.mjs', import.meta.url));

describe('new-owner onboarding across fresh CLI processes', { timeout: 20_000 }, () => {
  let root: string;
  let bin: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'album-owner-walkthrough-'));
    bin = path.join(root, 'fake-bin');
    await mkdir(bin);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function run(...args: string[]) {
    const result = spawnSync(process.execPath, [onboarding, ...args], {
      cwd: root,
      env: { ...process.env, PATH: bin },
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  }

  async function fakeCommand(name: string, body: string) {
    const file = path.join(bin, name);
    await writeFile(file, `#!${process.execPath}\n${body}\n`);
    await chmod(file, 0o755);
  }

  it('resumes existing Light checkpoints and accepts either spelling of the Lite command', async () => {
    const checkpoint = path.join(root, '.album-onboarding.json');
    const original = { path: 'light', suno: { method: 'browser' } };
    await writeFile(checkpoint, JSON.stringify(original));
    expect(run('status')).toContain('Album Bot Lite');
    expect(JSON.parse(await readFile(checkpoint, 'utf8'))).toEqual(original);
    for (const spelling of ['lite', 'light']) {
      expect(run('path', spelling)).toContain('Album Bot Lite');
      expect(JSON.parse(await readFile(checkpoint, 'utf8'))).toEqual(original);
    }
  });

  it('resumes each synthetic setup checkpoint in a new process after interruptions', async () => {
    expect(run('status')).toContain('Next: Choose Album Bot Lite');
    expect(run('path', 'quick')).toContain('Onboarding 0/2');
    expect(run('path', 'studio')).toContain('Onboarding 0/3');

    await mkdir(path.join(root, 'album'));
    await writeFile(
      path.join(root, 'album', 'album.json'),
      JSON.stringify({
        title: 'Fixture album',
        genre: 'house',
        tracks: [{ number: 1, title: 'One' }],
      })
    );
    await writeFile(path.join(root, 'album', 'BRIEF.md'), '# Fixture album\n');
    expect(run('status')).toContain('Next: Check the signed-in Suno connector');

    // A fake provider command is intentionally not installed: the checkpoint only records
    // a claimed external check and must not be mistaken for a live Suno connection.
    expect(run('verify-suno', 'mcp', 'create', 'status', 'models', 'credits')).toContain(
      'download unverified'
    );
    expect(run('status')).toContain('Next: Check Cursor installation');
    await fakeCommand('cursor', 'console.log("Cursor fixture");');
    expect(run('status')).toContain('connected model execution unverified');
    expect(run('verify-cursor', 'observed-fixture-model')).toContain(
      'Next: Run the Suno preflight'
    );

    expect(run('status', '--hosted')).toContain('Deploy the album files directly');
    await writeFile(
      path.join(root, '.album-site.json'),
      '{"siteUrl":"https://fixture.example","project":"fixture"}'
    );
    expect(run('verify-vercel', 'fixture', 'https://fixture.example')).toContain(
      'Next: Open /vote signed out'
    );
    expect(run('status', '--hosted')).toContain('Public site: https://fixture.example');
    await writeFile(path.join(root, '.album-site.json'), '{"siteUrl":"https://new.example"}');
    expect(run('status', '--hosted')).toContain('Public site: https://new.example');
    expect(run('confirm-owner-access')).toContain('Next: Open /vote signed out');
    expect(run('status')).toContain('Next: Run the Suno preflight');

    const saved = JSON.parse(await readFile(path.join(root, '.album-onboarding.json'), 'utf8'));
    expect(saved).toMatchObject({
      path: 'studio',
      suno: { capabilities: ['create', 'status', 'models', 'credits'] },
      cursor: { observedModel: 'observed-fixture-model' },
      ownerAccess: { siteUrl: 'https://new.example' },
    });
    expect(JSON.stringify(saved)).not.toMatch(/password|token|code|secret/i);
  });
});
