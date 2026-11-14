// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  connectAlbumRepo,
  disconnectKitRepo,
  ensureGitHubRepo,
  EXIT,
  ExitError,
  readEnvFile,
  rotateAlbumKey,
  slugify,
  usableAlbumKey,
  usableOwnerPassword,
} from '../../../scripts/setup.mjs';

type Result = { status: number; stdout: string; stderr: string; shown: string };

function fakeRunner(responses: Record<string, Partial<Result>>, dryRun = false) {
  const calls: string[] = [];
  function run(command: string, args: string[]): Result {
    const shown = [command, ...args].join(' ');
    calls.push(shown);
    const response = Object.entries(responses).find(([prefix]) => shown.startsWith(prefix))?.[1];
    return { status: 0, stdout: '', stderr: '', ...response, shown };
  }
  return {
    calls,
    runner: {
      dryRun,
      run,
      vercel: (args: string[]) => run('npx', ['--yes', 'vercel@65.11.0', ...args]),
      must: (result: Result) => {
        if (result.status !== 0) {
          throw new ExitError(EXIT.failed, `Failed: ${result.shown}`);
        }
        return result;
      },
    },
  };
}

describe('ensureGitHubRepo', () => {
  const kit = 'https://github.com/sashakhad/album-kit.git';

  it('names a signed-out GitHub CLI and does not create a repo', () => {
    const { runner, calls } = fakeRunner({
      'git remote get-url kit': { stdout: `${kit}\n` },
      'git remote get-url origin': { status: 2, stderr: 'No such remote' },
      'gh auth status': { status: 1, stderr: 'You are not logged into any GitHub hosts.' },
    });

    const result = ensureGitHubRepo(runner, { project: 'my-album' });

    expect(result.ok).toBe(false);
    expect(result.blocker).toMatch(/not signed in/);
    expect(result.blocker).toMatch(/kit remote/);
    expect(calls.some(call => call.startsWith('gh repo create'))).toBe(false);
  });

  it('refuses to use the kit repository as origin', () => {
    const { runner, calls } = fakeRunner({
      'git remote get-url kit': { stdout: `${kit}\n` },
      'git remote get-url origin': { stdout: `${kit}\n` },
    });

    const result = ensureGitHubRepo(runner, { project: 'my-album' });

    expect(result.ok).toBe(false);
    expect(result.blocker).toMatch(/album kit/);
    expect(calls.some(call => call.startsWith('gh '))).toBe(false);
  });

  it('creates a private repo when gh is signed in and origin is missing', () => {
    const { runner, calls } = fakeRunner({
      'git remote get-url kit': { stdout: `${kit}\n` },
      'git remote get-url origin': { status: 2 },
      'gh auth status': { stdout: 'Logged in to github.com\n' },
      'gh repo create': { stdout: 'https://github.com/me/my-album\n' },
      'gh repo view': {
        stdout: JSON.stringify({
          url: 'https://github.com/me/my-album',
          isPrivate: true,
          nameWithOwner: 'me/my-album',
        }),
      },
    });

    const result = ensureGitHubRepo(runner, { project: 'my-album' });

    expect(result).toEqual({ ok: true, blocker: null, url: 'https://github.com/me/my-album' });
    expect(calls.some(call => call.includes('--private'))).toBe(true);
  });
});

describe('disconnectKitRepo', () => {
  const API = 'npx --yes vercel@65.11.0 api /v9/projects/prj_album --raw';
  const DISCONNECT = 'npx --yes vercel@65.11.0 git disconnect --yes';

  async function linkedFolder(): Promise<{ root: string; cleanup: () => Promise<void> }> {
    const { mkdir, mkdtemp, rm, writeFile } = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const root = await mkdtemp(path.join(os.tmpdir(), 'album-link-'));
    await mkdir(path.join(root, '.vercel'));
    await writeFile(
      path.join(root, '.vercel', 'project.json'),
      JSON.stringify({ projectId: 'prj_album', projectName: 'my-album' })
    );
    return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
  }

  function projectLinkedTo(org: string, repo: string): Partial<Result> {
    return { stdout: JSON.stringify({ id: 'prj_album', link: { type: 'github', org, repo } }) };
  }

  it.each([
    'https://github.com/sashakhad/album-kit',
    'https://github.com/sashakhad/album-kit.git',
    'git@github.com:sashakhad/album-kit.git',
  ])('disconnects a project connected to the kit remote at %s', async kitUrl => {
    const { root, cleanup } = await linkedFolder();
    const { runner, calls } = fakeRunner({
      'git remote get-url kit': { stdout: `${kitUrl}\n` },
      [API]: projectLinkedTo('SashaKhad', 'album-kit'),
    });

    disconnectKitRepo(runner, root);

    expect(calls).toEqual(['git remote get-url kit', API, DISCONNECT]);
    await cleanup();
  });

  it("keeps a project connected to the album's own repo", async () => {
    const { root, cleanup } = await linkedFolder();
    const { runner, calls } = fakeRunner({
      'git remote get-url kit': { stdout: 'https://github.com/sashakhad/album-kit\n' },
      [API]: projectLinkedTo('someone', 'my-album'),
    });

    disconnectKitRepo(runner, root);

    expect(calls).not.toContain(DISCONNECT);
    await cleanup();
  });

  it('does nothing without a kit remote', async () => {
    const { root, cleanup } = await linkedFolder();
    const { runner, calls } = fakeRunner({ 'git remote get-url kit': { status: 2 } });

    disconnectKitRepo(runner, root);

    expect(calls).toEqual(['git remote get-url kit']);
    await cleanup();
  });

  it('lists both steps in a dry run', () => {
    const { runner, calls } = fakeRunner({}, true);

    disconnectKitRepo(runner, '/nowhere');

    expect(calls).toEqual([
      'git remote get-url kit',
      'npx --yes vercel@65.11.0 api /v9/projects/<project id> --raw',
      DISCONNECT,
    ]);
  });
});

describe('setup helpers', () => {
  it('accepts an owner-chosen password and rejects a generated-looking placeholder', () => {
    expect(usableOwnerPassword('shrimp-club')).toBe('shrimp-club');
    expect(usableOwnerPassword('  correct horse  ')).toBe('correct horse');
    expect(usableOwnerPassword('no')).toBeNull();
    expect(usableOwnerPassword('[SENSITIVE]')).toBeNull();
    expect(usableOwnerPassword('line\nbreak')).toBeNull();
    expect(usableAlbumKey('dev')).toBe('dev');
  });

  it('replaces ALBUM_KEY without reading the old password', () => {
    const { runner, calls } = fakeRunner({}, true);
    expect(rotateAlbumKey(runner, 'shrimp-club')).toEqual({
      updated: ['production', 'preview', 'development'],
      cli: true,
    });
    expect(calls.some(call => call.includes('shrimp-club'))).toBe(false);
    expect(calls.filter(call => call.includes('env rm ALBUM_KEY'))).toHaveLength(3);
    expect(calls.filter(call => call.includes('--value <owner password>'))).toHaveLength(3);
  });

  it('slugifies album titles into project names', () => {
    expect(slugify('Untitled album')).toBe('untitled-album');
    expect(slugify("D0n't St0p!")).toBe('d0nt-st0p');
    expect(slugify('???')).toBe('');
  });

  it('reads values from an env file', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'env-file-'));
    const file = path.join(dir, '.env.local');
    await writeFile(file, '# pulled\nALBUM_KEY="plum-river-quiet-42"\nEMPTY=""\nBARE=value\n');

    expect(readEnvFile(file)).toEqual({
      ALBUM_KEY: 'plum-river-quiet-42',
      EMPTY: '',
      BARE: 'value',
    });
    expect(readEnvFile(path.join(dir, 'missing'))).toEqual({});
    await rm(dir, { recursive: true, force: true });
  });

  it("never takes vercel env pull's placeholder for a Secret as the album key", () => {
    expect(usableAlbumKey('plum-river-quiet-42\n')).toBe('plum-river-quiet-42');
    expect(usableAlbumKey('[SENSITIVE]')).toBeNull();
    expect(usableAlbumKey('[SENSITIVE]\n')).toBeNull();
    expect(usableAlbumKey('  ')).toBeNull();
    expect(usableAlbumKey(undefined)).toBeNull();
    expect(usableAlbumKey(null)).toBeNull();
  });
});

describe('connectAlbumRepo', () => {
  it('does nothing when the project is already linked to origin', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const root = await mkdtemp(path.join(os.tmpdir(), 'album-git-'));
    await mkdir(path.join(root, '.vercel'));
    await writeFile(path.join(root, '.vercel', 'project.json'), '{"projectId":"prj_album"}');
    const { runner, calls } = fakeRunner({
      'git remote get-url origin': { stdout: 'https://github.com/owner/my-album.git\n' },
      'npx --yes vercel@65.11.0 api': {
        stdout: JSON.stringify({ link: { org: 'owner', repo: 'my-album' } }),
      },
    });

    expect(connectAlbumRepo(runner, root)).toEqual({ connected: true });
    expect(calls.some(call => call.includes('git connect'))).toBe(false);
    await rm(root, { recursive: true, force: true });
  });

  it('connects origin when the project has no Git link', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const root = await mkdtemp(path.join(os.tmpdir(), 'album-git-'));
    await mkdir(path.join(root, '.vercel'));
    await writeFile(path.join(root, '.vercel', 'project.json'), '{"projectId":"prj_album"}');
    const { runner, calls } = fakeRunner({
      'git remote get-url origin': { stdout: 'git@github.com:owner/my-album.git\n' },
      'npx --yes vercel@65.11.0 api': { stdout: '{}' },
    });

    expect(connectAlbumRepo(runner, root)).toEqual({ connected: true });
    expect(calls.some(call => call.includes('git connect --yes'))).toBe(true);
    await rm(root, { recursive: true, force: true });
  });
});
