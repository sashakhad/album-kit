// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const onboarding = fileURLToPath(new URL('../../../scripts/onboarding.mjs', import.meta.url));

describe('new-owner onboarding across fresh CLI processes', () => {
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

  it('resumes each synthetic setup checkpoint in a new process after interruptions', async () => {
    expect(run('status')).toContain('Onboarding 0/5');
    expect(run('path', 'studio')).toContain('Onboarding 0/6');

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
    expect(run('status')).toContain('Next: Sign in to GitHub');

    await fakeCommand(
      'git',
      "if (process.argv.slice(2).join(' ') === 'remote get-url origin') console.log('https://github.com/owner/album.git'); else console.log('https://github.com/sashakhad/album-kit.git');"
    );
    await fakeCommand('gh', 'process.exit(0);');
    expect(run('status')).toContain('Next: Ask the owner to finish Vercel sign-in');

    await fakeCommand('vercel', 'process.exit(0);');
    expect(run('status')).toContain('Next: Run pnpm setup:site');
    await mkdir(path.join(root, '.vercel'));
    await writeFile(path.join(root, '.vercel', 'project.json'), '{"projectId":"prj_fixture"}');
    await writeFile(path.join(root, '.album-site.json'), '{"siteUrl":"https://fixture.example"}');
    expect(run('status')).toContain('Next: Create a single-use owner link');
    expect(run('confirm-owner-access')).toContain('Next: Check Cursor installation');

    await fakeCommand('cursor', 'console.log("Cursor fixture");');
    expect(run('status')).toContain('connected model execution unverified');
    expect(run('verify-cursor', 'observed-fixture-model')).toContain(
      'Next: Run the Suno preflight'
    );

    // An interrupted site setup and a changed URL each reopen their own checkpoint.
    await rm(path.join(root, '.vercel', 'project.json'));
    expect(run('status')).toContain('Next: Run pnpm setup:site');
    await writeFile(path.join(root, '.vercel', 'project.json'), '{"projectId":"prj_fixture"}');
    await writeFile(path.join(root, '.album-site.json'), '{"siteUrl":"https://new.example"}');
    expect(run('status')).toContain('Next: Create a single-use owner link');
    expect(run('confirm-owner-access')).toContain('Next: Run the Suno preflight');

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
