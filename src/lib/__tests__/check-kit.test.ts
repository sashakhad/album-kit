// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { checkKit } from '../../../scripts/check-kit.mjs';

const revision = 'a'.repeat(40);
const base = `https://raw.githubusercontent.com/sashakhad/album-kit/${revision}`;
let root: string;

function upstream(branch = 'main', sha = revision) {
  return Response.json({ ref: `refs/heads/${branch}`, object: { type: 'commit', sha } });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'kit-check-'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

it.each(['main', 'beta/iterate'])(
  'pins live instructions for %s from a plain directory',
  async ref => {
    vi.stubEnv('PATH', '');
    const request = vi.fn().mockResolvedValue(upstream(ref));
    const report = await checkKit({ root, ref, request });
    expect(request).toHaveBeenCalledWith(
      `https://api.github.com/repos/sashakhad/album-kit/git/ref/heads/${ref}`,
      expect.objectContaining({
        credentials: 'omit',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      })
    );
    expect(report).toMatchObject({
      currentRevision: revision,
      installedRevision: null,
      status: 'unverified',
      botUrl: `${base}/grokbot/BOT.md`,
      skillsBaseUrl: `${base}/.cursor/skills/`,
    });
  }
);

it('checks an explicit full SHA and keeps the recorded installation comparison', async () => {
  writeFileSync(path.join(root, '.album-site.json'), JSON.stringify({ kitRevision: revision }));
  const request = vi.fn().mockResolvedValue(Response.json({ sha: revision }));
  expect((await checkKit({ root, ref: revision, request })).status).toBe('current');
  expect(request.mock.calls[0]?.[0]).toBe(
    `https://api.github.com/repos/sashakhad/album-kit/git/commits/${revision}`
  );
  const updated = await checkKit({ root, request: async () => upstream('main', 'b'.repeat(40)) });
  expect(updated.status).toBe('update-available');
});

it('leaves live instructions unresolved when the source is offline, missing, or returns a different ref', async () => {
  writeFileSync(path.join(root, '.album-site.json'), JSON.stringify({ kitRevision: revision }));
  for (const request of [
    vi.fn().mockRejectedValue(new Error('offline')),
    vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    vi.fn().mockResolvedValue(upstream('somewhere-else')),
    vi.fn().mockResolvedValue(upstream('main', 'malformed')),
  ]) {
    expect(await checkKit({ root, request })).toMatchObject({
      installedRevision: revision,
      currentRevision: null,
      botUrl: null,
      skillsBaseUrl: null,
      status: 'unverified',
    });
  }
});

it('only counts a legacy tracking revision as installed when the checkout incorporates it', async () => {
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: root, encoding: 'utf8' }
    ).trim();
  git('init', '--quiet');
  git('commit', '--quiet', '--allow-empty', '-m', 'installed release');
  const installed = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/kit/main', installed);
  expect((await checkKit({ root, request: async () => upstream('main', installed) })).status).toBe(
    'current'
  );
  git('commit', '--quiet', '--allow-empty', '-m', 'later release');
  git('update-ref', 'refs/remotes/kit/main', git('rev-parse', 'HEAD'));
  git('checkout', '--quiet', '--detach', installed);
  expect((await checkKit({ root, request: async () => upstream() })).installedRevision).toBeNull();
});

it.each([
  '',
  '/beta',
  'beta//bad',
  '../foreign',
  '--version',
  'refs/heads/../main',
  'https://elsewhere.test/file',
])('rejects invalid ref %j before networking', async ref => {
  const request = vi.fn();
  await expect(checkKit({ root, ref, request })).rejects.toThrow(/branch name or full commit SHA/);
  expect(request).not.toHaveBeenCalled();
});
