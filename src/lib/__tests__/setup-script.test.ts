// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deployAsAccountOwner,
  EXIT,
  ExitError,
  generateAlbumKey,
  readEnvFile,
  slugify,
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

const USER = JSON.stringify({
  user: { email: 'Owner@Example.com', name: 'Album Owner', username: 'album-owner' },
});

describe('deployAsAccountOwner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stops with exit code 4 when the account email cannot be read', () => {
    const failed = fakeRunner({ 'npx --yes vercel@65.11.0 api': { status: 1 } });
    expect(() => deployAsAccountOwner(failed.runner)).toThrow(
      expect.objectContaining({ code: EXIT.noAccountEmail })
    );

    const noEmail = fakeRunner({
      'npx --yes vercel@65.11.0 api': { stdout: JSON.stringify({ user: { username: 'x' } }) },
    });
    expect(() => deployAsAccountOwner(noEmail.runner)).toThrow(/npx vercel login/);
    expect(EXIT.noAccountEmail).toBe(4);
  });

  it('stops with exit code 4 before the login flow when signed out', () => {
    const { runner, calls } = fakeRunner({ 'npx --yes vercel@65.11.0 whoami': { status: 1 } });

    expect(() => deployAsAccountOwner(runner)).toThrow(
      expect.objectContaining({ code: EXIT.noAccountEmail })
    );
    expect(calls).toEqual(['npx --yes vercel@65.11.0 whoami']);
  });

  it('does nothing when the last commit is already the account owner', () => {
    const { runner, calls } = fakeRunner({
      'npx --yes vercel@65.11.0 api': { stdout: USER },
      'git log -1': { stdout: 'owner@example.com\n' },
    });

    deployAsAccountOwner(runner);

    expect(calls.some(call => call.startsWith('git config'))).toBe(false);
    expect(calls.some(call => call.startsWith('git commit'))).toBe(false);
  });

  it('commits as the account owner when the last author differs', () => {
    const { runner, calls } = fakeRunner({
      'npx --yes vercel@65.11.0 api': { stdout: USER },
      'git log -1': { stdout: 'kit@example.com\n' },
    });

    deployAsAccountOwner(runner);

    expect(calls.slice(-3)).toEqual([
      'git config user.name Album Owner',
      'git config user.email Owner@Example.com',
      'git commit --allow-empty -m album: deploy as album-owner',
    ]);
  });

  it('skips the commit outside a git repo', () => {
    const { runner, calls } = fakeRunner({
      'npx --yes vercel@65.11.0 api': { stdout: USER },
      'git rev-parse': { status: 128 },
    });

    deployAsAccountOwner(runner);

    expect(calls.some(call => call.startsWith('git commit'))).toBe(false);
  });

  it('lists every step in a dry run', () => {
    const { runner, calls } = fakeRunner({}, true);

    deployAsAccountOwner(runner, { checkSignIn: false });

    expect(calls).toEqual([
      'npx --yes vercel@65.11.0 api /v2/user --raw',
      'git log -1 --format=%ae',
      'git config user.name <account name>',
      'git config user.email <account email>',
      'git commit --allow-empty -m album: deploy as <username>',
    ]);
  });
});

describe('setup helpers', () => {
  it('makes keys from three different words and two digits', () => {
    for (let index = 0; index < 50; index += 1) {
      const key = generateAlbumKey();
      expect(key).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/);
      const words = key.split('-').slice(0, 3);
      expect(new Set(words).size).toBe(3);
    }
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
});
