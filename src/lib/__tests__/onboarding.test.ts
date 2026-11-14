// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main, nextStep, probeReadiness } from '../../../scripts/onboarding.mjs';

type ProbeResult = { ready: boolean; output: string };

function runner(overrides: Record<string, ProbeResult> = {}) {
  return (command: string, args: string[]): ProbeResult => {
    const call = `${command} ${args.join(' ')}`;
    return overrides[call] ?? { ready: false, output: '' };
  };
}

const readyCommands = {
  'cursor --version': { ready: true, output: 'Cursor 1.0' },
  'vercel whoami': { ready: true, output: 'owner' },
  'gh auth status': { ready: true, output: '' },
  'gh api user --hostname github.com --jq .login': { ready: true, output: 'owner' },
  'gh api repos/owner/album --hostname github.com --jq .full_name': {
    ready: true,
    output: 'owner/album',
  },
  'git remote get-url origin': { ready: true, output: 'https://github.com/owner/album.git' },
  'git remote get-url kit': { ready: true, output: 'https://github.com/sashakhad/album-kit' },
};

describe('onboarding checkpoint', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'album-onboarding-'));
    await mkdir(path.join(root, 'album'));
    await mkdir(path.join(root, '.vercel'));
    await writeFile(
      path.join(root, 'album', 'album.json'),
      JSON.stringify({ title: 'My album', genre: 'house', tracks: [{ number: 1, title: 'Track' }] })
    );
    await writeFile(path.join(root, 'album', 'BRIEF.md'), '# My album\n');
    await writeFile(path.join(root, '.vercel', 'project.json'), '{"projectId":"prj_123"}');
    await writeFile(path.join(root, '.album-site.json'), '{"siteUrl":"https://album.example"}');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it('separates installed tools from verified provider capabilities', () => {
    const status = probeReadiness(root, runner(readyCommands));
    expect(status.cursor).toEqual({ installed: true, modelExecutionVerified: false });
    expect(status.suno.capabilitiesVerified).toBe(false);
    expect(status.vercel).toEqual({ cliSignedIn: true, siteProvisioned: true });
    expect(nextStep(status)).toContain('Suno connector');
  });

  it('keeps status idempotent and lets the owner return from Studio to Quick start', async () => {
    const run = runner(readyCommands);
    main(['status'], root, run);
    main(['status'], root, run);
    expect(() => main(['status', 'extra'], root, run)).toThrow('Usage');
    main(['path', 'studio'], root, run);
    expect(probeReadiness(root, run).path).toBe('studio');
    main(['path', 'quick'], root, run);
    expect(probeReadiness(root, run).path).toBe('quick');
    const saved = JSON.parse(await readFile(path.join(root, '.album-onboarding.json'), 'utf8'));
    expect(saved).toEqual({ path: 'quick' });
  });

  it('requires distinct user-owned and kit remotes', () => {
    const status = probeReadiness(
      root,
      runner({
        ...readyCommands,
        'git remote get-url origin': {
          ready: true,
          output: 'git@github.com:sashakhad/album-kit.git',
        },
      })
    );
    expect(status.github.albumRemote).toBe(false);
  });

  it('requires the origin owner to match the signed-in GitHub account', () => {
    const wrongAccount = probeReadiness(
      root,
      runner({
        ...readyCommands,
        'gh api user --hostname github.com --jq .login': {
          ready: true,
          output: 'someone-else',
        },
      })
    );
    expect(wrongAccount.github).toMatchObject({
      signedIn: true,
      account: 'someone-else',
      albumRemote: false,
    });
    expect(
      nextStep({
        ...wrongAccount,
        suno: { ...wrongAccount.suno, capabilitiesVerified: true },
      })
    ).toContain('owned by someone-else');

    const unverifiedAccount = probeReadiness(
      root,
      runner({
        ...readyCommands,
        'gh api user --hostname github.com --jq .login': { ready: false, output: '' },
      })
    );
    expect(unverifiedAccount.github.albumRemote).toBe(false);
    expect(
      nextStep({
        ...unverifiedAccount,
        suno: { ...unverifiedAccount.suno, capabilitiesVerified: true },
      })
    ).toContain('gh api user');
  });

  it('rejects non-GitHub origins and accepts the signed-in owner over SSH', () => {
    const nonGithub = probeReadiness(
      root,
      runner({
        ...readyCommands,
        'git remote get-url origin': {
          ready: true,
          output: 'https://github.com.evil.example/owner/album.git',
        },
      })
    );
    expect(nonGithub.github.albumRemote).toBe(false);

    const ssh = probeReadiness(
      root,
      runner({
        ...readyCommands,
        'git remote get-url origin': {
          ready: true,
          output: 'git@github.com:OWNER/album.git',
        },
      })
    );
    expect(ssh.github.albumRemote).toBe(true);
  });

  it('does not count an owner-named origin until GitHub confirms the repository exists', () => {
    const missingRepo = probeReadiness(
      root,
      runner({
        ...readyCommands,
        'gh api repos/owner/album --hostname github.com --jq .full_name': {
          ready: false,
          output: '',
        },
      })
    );
    expect(missingRepo.github.albumRemote).toBe(false);
  });

  it('resumes in one step after recorded live checks and invalidates a changed site', async () => {
    const run = runner(readyCommands);
    main(['path', 'studio'], root, run);
    main(['verify-suno', 'mcp', 'create', 'status', 'download', 'models', 'credits'], root, run);
    main(['verify-cursor', 'Claude Sonnet 4.5'], root, run);
    main(['confirm-owner-access'], root, run);
    const saved = JSON.parse(await readFile(path.join(root, '.album-onboarding.json'), 'utf8'));
    expect(saved).toEqual({
      path: 'studio',
      suno: {
        method: 'mcp',
        capabilities: ['create', 'status', 'download', 'models', 'credits'],
        checkedAt: expect.any(String),
      },
      cursor: { observedModel: 'Claude Sonnet 4.5', checkedAt: expect.any(String) },
      ownerAccess: { confirmedAt: expect.any(String), siteUrl: 'https://album.example' },
    });
    const status = probeReadiness(root, run);
    expect(status.suno.downloadVerified).toBe(true);
    expect(nextStep(status)).toContain('preflight');
    expect(nextStep(status)).not.toContain('Verify download capability');
    await writeFile(path.join(root, '.album-site.json'), '{"siteUrl":"https://other.example"}');
    expect(nextStep(probeReadiness(root, run))).toContain('owner link');
  });

  it('accepts public-streaming capabilities without a download check', async () => {
    const run = runner(readyCommands);
    main(['verify-suno', 'mcp', 'create', 'status', 'models', 'credits'], root, run);
    main(['confirm-owner-access'], root, run);
    const status = probeReadiness(root, run);
    expect(status.suno).toMatchObject({
      capabilitiesVerified: true,
      downloadVerified: false,
    });
    expect(nextStep(status)).toContain('preflight');
    expect(nextStep(status)).toContain('Verify download capability before private review');
    const saved = JSON.parse(await readFile(path.join(root, '.album-onboarding.json'), 'utf8'));
    expect(saved.suno.capabilities).toEqual(['create', 'status', 'models', 'credits']);
  });

  it('expires Suno capability evidence before paid work', async () => {
    const checkedAt = '2026-11-13T10:00:00.000Z';
    await writeFile(
      path.join(root, '.album-onboarding.json'),
      JSON.stringify({
        cursor: { observedModel: 'Claude Sonnet 4.5', checkedAt },
        suno: {
          method: 'mcp',
          capabilities: ['create', 'status', 'download', 'models', 'credits'],
          checkedAt,
        },
      })
    );
    const near = probeReadiness(root, runner(readyCommands), Date.parse(checkedAt) + 29 * 60_000);
    const stale = probeReadiness(root, runner(readyCommands), Date.parse(checkedAt) + 31 * 60_000);
    expect(near.suno.capabilitiesVerified).toBe(true);
    expect(stale.suno.capabilitiesVerified).toBe(false);
    expect(near.cursor.modelExecutionVerified).toBe(true);
    expect(stale.cursor.modelExecutionVerified).toBe(false);
    expect(nextStep(stale)).toContain('Suno connector');
  });

  it('refuses incomplete capability claims and owner confirmation without a site', async () => {
    const run = runner(readyCommands);
    expect(() => main(['verify-suno', 'mcp', 'create'], root, run)).toThrow('Usage');
    expect(() =>
      main(['verify-suno', 'mcp', 'create', 'status', 'models', 'credits', 'fake'], root, run)
    ).toThrow('Usage');
    expect(() =>
      main(['verify-suno', 'mcp', 'create', 'status', 'models', 'credits', 'credits'], root, run)
    ).toThrow('Usage');
    await rm(path.join(root, '.album-site.json'));
    expect(() => main(['confirm-owner-access'], root, run)).toThrow('provisioned site URL');
  });
});
