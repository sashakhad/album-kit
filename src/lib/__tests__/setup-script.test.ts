// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  ensureGitHubRepo,
  EXIT,
  ExitError,
  readEnvFile,
  slugify,
  usableWriteToken,
  generateWriteToken,
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

  it('recognizes the upstream kit even without a second Git remote', () => {
    const { runner, calls } = fakeRunner({
      'git remote get-url origin': { stdout: 'git@github.com:SashaKhad/album-kit.git\n' },
      'git remote get-url kit': { status: 2 },
    });
    expect(ensureGitHubRepo(runner, { project: 'my-album' }).ok).toBe(false);
    expect(calls.some(call => call.startsWith('gh '))).toBe(false);
  });

  it('verifies the existing SSH origin without creating another repo or changing Vercel', () => {
    const { runner, calls } = fakeRunner({
      'git remote get-url kit': { status: 2 },
      'git remote get-url origin': { stdout: 'git@github.com:maker/my-songs.git\n' },
      'gh repo view maker/my-songs': {
        stdout: JSON.stringify({
          url: 'https://github.com/maker/my-songs',
          nameWithOwner: 'maker/my-songs',
          isPrivate: true,
        }),
      },
    });
    expect(ensureGitHubRepo(runner, { project: 'my-album' })).toEqual({
      ok: true,
      blocker: null,
      url: 'https://github.com/maker/my-songs',
    });
    expect(calls.some(call => /git push|gh repo create|vercel/.test(call))).toBe(false);
  });

  it('creates a public repo when gh is signed in and origin is missing', () => {
    const { runner, calls } = fakeRunner({
      'git remote get-url kit': { stdout: `${kit}\n` },
      'git remote get-url origin': { status: 2 },
      'gh auth status': { stdout: 'Logged in to github.com\n' },
      'gh repo create': { stdout: 'https://github.com/me/my-album\n' },
      'gh repo view': {
        stdout: JSON.stringify({
          url: 'https://github.com/me/my-album',
          isPrivate: false,
          nameWithOwner: 'me/my-album',
        }),
      },
    });

    const result = ensureGitHubRepo(runner, { project: 'my-album' });

    expect(result).toEqual({ ok: true, blocker: null, url: 'https://github.com/me/my-album' });
    expect(calls.some(call => call.includes('--public'))).toBe(true);
  });
});

describe('setup helpers', () => {
  it('accepts a generated write token and rejects a placeholder', () => {
    expect(usableWriteToken(generateWriteToken())).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(usableWriteToken('[SENSITIVE]')).toBeNull();
    expect(usableWriteToken('short')).toBeNull();
    expect(usableWriteToken('line\nbreak-and-more-than-thirty-two')).toBeNull();
    expect(usableWriteToken(undefined)).toBeNull();
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
    await writeFile(
      file,
      '# pulled\nALBUM_WRITE_TOKEN="plum-river-quiet-42-extra-token-value"\nEMPTY=""\nBARE=value\n'
    );

    expect(readEnvFile(file)).toEqual({
      ALBUM_WRITE_TOKEN: 'plum-river-quiet-42-extra-token-value',
      EMPTY: '',
      BARE: 'value',
    });
    expect(readEnvFile(path.join(dir, 'missing'))).toEqual({});
    await rm(dir, { recursive: true, force: true });
  });

  it("never takes vercel env pull's placeholder for a Secret as the album key", () => {
    expect(usableWriteToken('plum-river-quiet-42-extra-token-value\n')).toBe(
      'plum-river-quiet-42-extra-token-value'
    );
    expect(usableWriteToken('[SENSITIVE]')).toBeNull();
    expect(usableWriteToken('[SENSITIVE]\n')).toBeNull();
    expect(usableWriteToken('  ')).toBeNull();
    expect(usableWriteToken(undefined)).toBeNull();
    expect(usableWriteToken(null)).toBeNull();
  });
});
