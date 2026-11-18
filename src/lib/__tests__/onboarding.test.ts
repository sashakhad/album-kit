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

  it('shows the setup choice and runs no tools on a fresh checkout or an unknown saved path', async () => {
    const run = vi.fn(runner(readyCommands));
    const stateFile = path.join(root, '.album-onboarding.json');
    const first = main(['status'], root, run);
    expect(first.path).toBe('light');
    expect(nextStep(first)).toContain('Choose Album Bot Light');
    await expect(readFile(stateFile)).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(stateFile, JSON.stringify({ path: 'unrecognized' }));
    const unknown = main(['status'], root, run);
    expect(unknown.github).toBeUndefined();
    expect(nextStep(unknown)).toContain('Choose Album Bot Light');
    expect(run).not.toHaveBeenCalled();
    expect(main(['path', 'full'], root, run).needsPathChoice).toBe(false);
  });

  it('separates installed tools from verified provider capabilities', () => {
    const run = vi.fn(runner(readyCommands));
    const status = main(['path', 'studio'], root, run);
    expect(status.cursor).toEqual({ installed: true, modelExecutionVerified: false });
    expect(status.suno.capabilitiesVerified).toBe(false);
    expect(status.vercel).toBeUndefined();
    expect(run.mock.calls).toEqual([['cursor', ['--version']]]);
    expect(nextStep(status)).toContain('Suno connector or Free browser');
  });

  it('runs Light locally without probing Cursor or any hosting service', () => {
    const run = vi.fn(runner());
    main(['path', 'light'], root, run);
    main(['verify-suno', 'browser', 'create', 'status', 'models'], root, run);
    const status = main(['status'], root, run);
    expect(status.path).toBe('light');
    expect(nextStep(status)).toContain('local preview');
    expect(run).not.toHaveBeenCalled();
    expect(vi.spyOn(console, 'log').mock.calls.flat().join(' ')).not.toMatch(
      /Cursor|GitHub|Vercel/
    );
  });

  it('requires paid Suno and working Cursor writers in Full Setup while keeping hosting out of setup', () => {
    const run = vi.fn(runner(readyCommands));
    main(['path', 'full'], root, run);
    const free = main(['verify-suno', 'browser', 'create', 'status', 'models'], root, run);
    expect(free.suno.capabilitiesVerified).toBe(false);
    expect(nextStep(free)).toContain('paid Suno');
    const connected = main(
      ['verify-suno', 'mcp', 'create', 'status', 'models', 'credits'],
      root,
      run
    );
    expect(nextStep(connected)).toContain('Cursor project');
    main(['verify-cursor', 'observed-writer'], root, run);
    const ready = main(['status'], root, run);
    expect(nextStep(ready)).toContain('up to five available Cursor writers');
    expect(nextStep(ready)).toContain('combined version');
    expect(new Set(run.mock.calls.map(([cmd]) => cmd))).toEqual(new Set(['cursor']));
    expect(vi.spyOn(console, 'log').mock.calls.flat().join(' ')).not.toMatch(/GitHub|Vercel/);
  });

  it('checks hosting on explicit request and resumes local status afterward', () => {
    const run = vi.fn(runner(readyCommands));
    main(['path', 'light'], root, run);
    const hosted = main(['status', '--hosted'], root, run);
    expect(hosted.github).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
    expect(hosted.vercel?.siteUrl).toBe('https://album.example');
    expect(nextStep(hosted)).toContain('Open /vote signed out');
    expect(nextStep(hosted)).toContain('public link');
    expect(vi.spyOn(console, 'log').mock.calls.flat().join(' ')).not.toMatch(
      /owner access|owner link|confirm-owner-access/i
    );
    run.mockClear();
    const local = main(['status'], root, run);
    expect(local.path).toBe('light');
    expect(local.github).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it.each(['quick', 'studio', 'light', 'full'])(
    'deploys directly for %s only when sharing is requested',
    async pathName => {
      await rm(path.join(root, '.album-site.json'));
      const run = vi.fn(runner());
      main(['path', pathName], root, run);
      const music = main(
        ['verify-suno', 'mcp', 'create', 'status', 'models', 'credits'],
        root,
        run
      );
      expect(nextStep(music)).not.toMatch(/Vercel|GitHub|deploy|owner link/i);
      expect(run.mock.calls.every(([cmd]) => cmd === 'cursor')).toBe(true);
      run.mockClear();
      const hosted = main(['status', '--hosted'], root, run);
      expect(nextStep(hosted)).toContain('Deploy the album files directly');
      expect(hosted.github).toBeUndefined();
      expect(run).not.toHaveBeenCalled();
    }
  );
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

  function checkBackup(run: ReturnType<typeof runner>) {
    return probeReadiness(root, run, Date.now(), { githubBackup: true });
  }

  it('requires distinct user-owned and kit remotes', () => {
    const status = checkBackup(
      runner({
        ...readyCommands,
        'git remote get-url origin': {
          ready: true,
          output: 'git@github.com:sashakhad/album-kit.git',
        },
      })
    );
    expect(status.github?.albumRemote).toBe(false);
  });

  it('requires the origin owner to match the signed-in GitHub account', () => {
    const wrongAccount = checkBackup(
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
    expect(nextStep(wrongAccount)).toContain('owned by someone-else');

    const unverifiedAccount = checkBackup(
      runner({
        ...readyCommands,
        'gh api user --hostname github.com --jq .login': { ready: false, output: '' },
      })
    );
    expect(unverifiedAccount.github?.albumRemote).toBe(false);
    expect(nextStep(unverifiedAccount)).toContain('connector or gh');
  });

  it('rejects non-GitHub origins and accepts the signed-in owner over SSH', () => {
    const nonGithub = checkBackup(
      runner({
        ...readyCommands,
        'git remote get-url origin': {
          ready: true,
          output: 'https://github.com.evil.example/owner/album.git',
        },
      })
    );
    expect(nonGithub.github?.albumRemote).toBe(false);

    const ssh = checkBackup(
      runner({
        ...readyCommands,
        'git remote get-url origin': {
          ready: true,
          output: 'git@github.com:OWNER/album.git',
        },
      })
    );
    expect(ssh.github?.albumRemote).toBe(true);
  });

  it('does not count an owner-named origin until GitHub confirms the repository exists', () => {
    const missingRepo = checkBackup(
      runner({
        ...readyCommands,
        'gh api repos/owner/album --hostname github.com --jq .full_name': {
          ready: false,
          output: '',
        },
      })
    );
    expect(missingRepo.github?.albumRemote).toBe(false);
  });

  it('resumes music setup from saved Studio checks and reads the latest URL when sharing', async () => {
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
    const hosted = main(['status', '--hosted'], root, run);
    expect(hosted.vercel?.siteUrl).toBe('https://other.example');
    expect(nextStep(hosted)).toContain('Open /vote signed out');
  });

  it('accepts public-streaming capabilities without a download check', async () => {
    main(['path', 'quick'], root, runner());
    const run = runner(readyCommands);
    main(['verify-suno', 'mcp', 'create', 'status', 'models', 'credits'], root, run);
    main(['confirm-owner-access'], root, run);
    const status = probeReadiness(root, run);
    expect(status.suno).toMatchObject({
      capabilitiesVerified: true,
      downloadVerified: false,
    });
    expect(nextStep(status)).toContain('preflight');
    expect(nextStep(status)).toContain('Verify download capability before final export');
    const saved = JSON.parse(await readFile(path.join(root, '.album-onboarding.json'), 'utf8'));
    expect(saved.suno.capabilities).toEqual(['create', 'status', 'models', 'credits']);
  });

  it('expires Suno capability evidence before paid work', async () => {
    const checkedAt = '2026-11-13T10:00:00.000Z';
    await writeFile(
      path.join(root, '.album-onboarding.json'),
      JSON.stringify({
        path: 'studio',
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
    expect(nextStep(stale)).toContain('Suno connector or Free browser');
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

  it('accepts freshly verified connectors without CLI login and invalidates changed resources', async () => {
    main(['path', 'quick'], root, runner());
    await writeFile(
      path.join(root, '.album-site.json'),
      '{"siteUrl":"https://album.example","project":"owner-album"}'
    );
    const connectorOnly = runner({
      'git remote get-url origin': readyCommands['git remote get-url origin'],
      'git remote get-url kit': readyCommands['git remote get-url kit'],
    });
    const backup = main(['verify-github', 'owner', 'owner/album'], root, connectorOnly);
    expect(backup.github).toMatchObject({
      signedIn: true,
      account: 'owner',
      albumRemote: true,
      connectorVerified: true,
    });
    const run = vi.fn(runner());
    const ready = main(['verify-vercel', 'owner-album', 'https://album.example'], root, run);
    expect(ready.vercel).toEqual({
      siteUrl: 'https://album.example',
      connectorVerified: true,
    });
    expect(ready.github).toBeUndefined();
    expect(run).not.toHaveBeenCalled();

    await writeFile(
      path.join(root, '.album-site.json'),
      '{"siteUrl":"https://different.example","project":"owner-album"}'
    );
    expect(main(['status', '--hosted'], root, run).vercel?.connectorVerified).toBe(false);
    const changedRemote = runner({
      'git remote get-url origin': { ready: true, output: 'https://github.com/other/album.git' },
      'git remote get-url kit': readyCommands['git remote get-url kit'],
    });
    expect(checkBackup(changedRemote).github?.albumRemote).toBe(false);

    expect(() => main(['verify-github', 'owner', 'other/album'], root, connectorOnly)).toThrow(
      'Usage'
    );
    expect(() =>
      main(['verify-vercel', 'owner-album', 'http://album.example'], root, connectorOnly)
    ).toThrow('Usage');
  });

  it('accepts a verified Free browser without a credit-balance capability', () => {
    const run = runner(readyCommands);
    main(['verify-suno', 'browser', 'create', 'status', 'models'], root, run);
    expect(probeReadiness(root, run).suno).toMatchObject({
      method: 'browser',
      capabilitiesVerified: true,
      downloadVerified: false,
    });
    expect(() => main(['verify-suno', 'mcp', 'create', 'status', 'models'], root, run)).toThrow(
      'Usage'
    );
  });
});
