// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostedProject, stageHostedApp } from '../../../scripts/hosted-app.mjs';
import { publish } from '../../../scripts/publish-album.mjs';
import { setup } from '../../../scripts/setup.mjs';

const url = 'https://test-album.vercel.app';
const project = {
  id: 'prj_album',
  name: 'test-album',
  accountId: 'team_Album',
  targets: { production: { alias: [new URL(url).hostname] } },
};
let root: string;
async function put(file: string, text = '') {
  const name = path.join(root, file);
  await mkdir(path.dirname(name), { recursive: true });
  await writeFile(name, text);
}

beforeEach(async () => {
  vi.stubEnv('VERCEL_PROJECT_ID', undefined);
  vi.stubEnv('VERCEL_ORG_ID', undefined);
  root = await mkdtemp(path.join(tmpdir(), 'test-hosted-kit-'));
  await Promise.all(
    [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'next.config.ts',
      'tsconfig.json',
      'postcss.config.mjs',
      'prisma.config.ts',
      'vercel.json',
      'scripts/vercel-build.mjs',
      'src/app/page.tsx',
      'prisma/schema.prisma',
      'public/logo.svg',
    ].map(file => put(file))
  );
  await put(
    'album/album.json',
    JSON.stringify({ title: 'Test Album', tracks: [{ number: 1, slug: 'track-one' }] })
  );
  await put('album/tracks/01-track-one.md', 'actual track prompts');
  await put('album/tracks/notes.md', 'private notes');
  await put('album/audio/take.mp3', 'local audio');
  await put('.env', 'SECRET=local-only');
  await put('.tmp/album-preview-ledger.json', 'local ledger');
  await put('src/__tests__/fixture.mp3', 'test audio');
  await put('unrelated.txt', 'private file');
  await symlink(path.join(root, '.env'), path.join(root, 'public', 'secret.svg'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function host(
  options: { collision?: boolean; existingEnv?: boolean; deploymentProjectId?: string } = {}
) {
  const deployments: string[][] = [];
  const uploads: string[][] = [];
  const keys = new Set(
    options.existingEnv ? ['DATABASE_URL', 'ALBUM_WRITE_TOKEN', 'BLOB_STORE_ID'] : []
  );
  const run = vi.fn((..._args: unknown[]) => {
    throw new Error('Expected only Vercel commands');
  });
  const vercel = vi.fn((args: string[]) => {
    let value: unknown = {};
    if (args[0] === 'api') {
      if (args.includes('POST') && options.collision) throw new Error('project already exists');
      value = project;
    }
    if (args[0] === 'env' && args[1] === 'ls') value = { envs: [...keys].map(key => ({ key })) };
    if (args[0] === 'blob') keys.add('BLOB_STORE_ID');
    if (args[0] === 'integration') keys.add('DATABASE_URL');
    if (args[0] === 'env' && args[1] === 'add') keys.add(args[2]!);
    if (args[0] === 'deploy') {
      deployments.push(args);
      uploads.push(
        readdirSync(args[args.indexOf('--cwd') + 1]!, { recursive: true, encoding: 'utf8' })
      );
      value = {
        deployment: {
          id: 'dpl_test',
          projectId: options.deploymentProjectId ?? project.id,
          readyState: 'READY',
          target: 'production',
          productionUrl: url,
        },
      };
    }
    return { stdout: JSON.stringify(value), stderr: '', status: 0, shown: args[0] ?? '' };
  });
  const runner = { run, dryRun: false, vercel, must: <T>(value: T) => value };
  const request = vi.fn(async (input: RequestInfo | URL) =>
    new URL(String(input)).pathname === '/api/votes'
      ? Response.json({ currentRound: 1 })
      : new Response('<title>Compare takes</title>', { headers: { 'content-type': 'text/html' } })
  );
  return { runner, deployments, uploads, request, keys };
}

describe('direct album deployment', () => {
  it('provisions from a directory without Git and verifies the listener page and ballot', async () => {
    const { runner, deployments, uploads, request, keys } = host();
    const options = { name: project.name, scope: 'test-scope' };
    await setup(options, root, runner, request);
    const site = JSON.parse(await readFile(path.join(root, '.album-site.json'), 'utf8'));
    expect(site).toMatchObject({
      projectId: project.id,
      orgId: project.accountId,
      deploy: 'direct',
      siteUrl: url,
    });
    expect(runner.run).not.toHaveBeenCalled();
    expect(existsSync(path.join(root, '.git'))).toBe(false);
    expect(deployments[0]).toEqual(
      expect.arrayContaining(['--project', project.id, '--scope', options.scope, '--prod'])
    );
    expect(keys).toEqual(new Set(['DATABASE_URL', 'ALBUM_WRITE_TOKEN', 'BLOB_STORE_ID']));
    expect(request.mock.calls.map(([uri]) => new URL(String(uri)).pathname)).toEqual([
      '/vote',
      '/api/votes',
    ]);
    expect(uploads[0]).toContain('album/tracks/01-track-one.md');
    expect(uploads[0]).not.toContain('album/tracks/notes.md');
    expect(uploads[0]).not.toContain('public/secret.svg');
    expect(uploads[0]).not.toContain('src/__tests__');
    for (const file of ['.env', '.git', '.tmp', '.vercel', 'album/audio', 'unrelated.txt'])
      expect(uploads[0]).not.toContain(file);
    await setup(options, root, runner, request);
    expect(deployments).toHaveLength(1);
  });
  it('publishes a legacy Git album to its original Vercel project without a remote', async () => {
    await put(
      '.album-site.json',
      JSON.stringify({ project: project.name, siteUrl: url, deploy: 'git' })
    );
    const { runner, deployments, request } = host();
    expect(await publish('New track', root, runner, request)).toBe(url);
    expect(deployments).toHaveLength(1);
    expect(runner.run).not.toHaveBeenCalled();
    expect(runner.vercel.mock.calls.some(([args]) => args.includes('POST'))).toBe(false);
    expect(JSON.parse(await readFile(path.join(root, '.album-site.json'), 'utf8')).deploy).toBe(
      'direct'
    );
  });
  it('rejects a deployment that names a different Vercel project', async () => {
    const { runner, request } = host({ deploymentProjectId: 'prj_other' });
    await expect(
      setup({ name: project.name, scope: 'test-scope' }, root, runner, request)
    ).rejects.toThrow('different project');
  });

  it('never adopts a different album with a matching project name', async () => {
    const { runner, deployments, request } = host({ collision: true });
    await expect(setup({ name: project.name }, root, runner, request)).rejects.toThrow(
      'already exists'
    );
    await put(
      '.album-site.json',
      JSON.stringify({ project: project.name, siteUrl: 'https://other.vercel.app', deploy: 'git' })
    );
    await expect(publish('New track', root, runner, request)).rejects.toThrow('does not belong');
    expect(deployments).toEqual([]);
  });
  it('checks the local and remote project IDs before it mounts credentials or stages files', async () => {
    await put(
      '.vercel/project.json',
      JSON.stringify({ projectId: 'prj_different', orgId: project.accountId })
    );
    const { runner, deployments } = host();
    await expect(
      hostedProject(root, { name: project.name, create: false }, runner)
    ).rejects.toThrow('did not confirm');
    expect(deployments).toEqual([]);
  });
  it('restores the public stream catalog after the preview cache is removed and preserves explicit removals', async () => {
    const album = {
      title: 'Test Album',
      sets: [{ id: 'v1' }],
      tracks: [{ number: 1, slug: 'track-one' }],
    };
    const stream = {
      filename: 'v1-01-track-one-p1-takea.mp3',
      clipId: 'first',
      streamUrl: 'https://cdn1.suno.ai/first.mp4',
    };
    await put('album/album.json', JSON.stringify(album));
    await put(
      '.tmp/album-preview-streams.json',
      JSON.stringify([{ ...stream, privateNote: 'local only' }])
    );
    const { runner, request } = host();
    await setup({ name: project.name, scope: 'test-scope' }, root, runner, request);
    const saved = path.join(root, 'album/public-streams.json');
    expect(JSON.parse(await readFile(saved, 'utf8'))).toEqual([stream]);
    await rm(path.join(root, '.tmp/album-preview-streams.json'));
    await publish('Restored album', root, runner, request);
    expect(JSON.parse(await readFile(saved, 'utf8'))).toEqual([stream]);
    await put('.tmp/album-preview-streams.json', '[]');
    await publish('Remove old stream', root, runner, request);
    expect(JSON.parse(await readFile(saved, 'utf8'))).toEqual([]);
  });

  it('rejects a track sheet symlink instead of following it', async () => {
    const sheet = path.join(root, 'album/tracks/01-track-one.md');
    await rm(sheet);
    await symlink(path.join(root, '.env'), sheet);
    await expect(stageHostedApp(root)).rejects.toThrow('Expected an album file');
  });
});
