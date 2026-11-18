// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, expect, it, vi } from 'vitest';

import { shareAlbum, verifyFullAlbum } from '../../../scripts/share-album.mjs';
import { publish } from '../../../scripts/publish-album.mjs';
import { createRunner } from '../../../scripts/setup.mjs';

const kit = fileURLToPath(new URL('../../../', import.meta.url));
const project = {
  name: 'my-album',
  id: 'prj_album',
  accountId: 'team_creator',
  targets: { production: { alias: ['my-album.vercel.app'] } },
};
const album = {
  title: 'Two & Three',
  sets: [{ id: 'v1' }],
  tracks: [{ number: 1, title: 'My Track', slug: 'my-track' }],
};
const take = {
  filename: 'v1-01-my-track-p1-takea.mp3',
  clipId: 'real',
  streamUrl: 'https://cdn1.suno.ai/real.mp4',
};
const siteUrl = 'https://my-album.vercel.app';
const publicPage = (html: string) =>
  new Response(html, { headers: { 'content-type': 'text/html' } });
let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
  vi.unstubAllEnvs();
});

it.each(['hosted', 'previous static'])(
  'shares and republishes a Full album using the official scaffold and its %s project',
  async origin => {
    vi.stubEnv('VERCEL_PROJECT_ID', undefined);
    vi.stubEnv('VERCEL_ORG_ID', undefined);
    root = await mkdtemp(path.join(tmpdir(), 'kit-full-'));
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: kit,
      encoding: 'utf8',
    }).trim();
    await mkdir(path.join(root, 'album/tracks'), { recursive: true });
    await mkdir(path.join(root, '.tmp'), { recursive: true });
    await writeFile(path.join(root, 'album/album.json'), JSON.stringify(album));
    await writeFile(path.join(root, 'album/tracks/01-my-track.md'), 'The owner’s track sheet');
    await writeFile(path.join(root, '.tmp/album-preview-streams.json'), JSON.stringify([take]));
    await writeFile(path.join(root, '.album-onboarding.json'), JSON.stringify({ path: 'studio' }));
    if (origin === 'hosted') {
      await writeFile(
        path.join(root, '.album-site.json'),
        JSON.stringify({ project: project.name, siteUrl, deploy: 'git' })
      );
    } else {
      await mkdir(path.join(root, '.tmp/share-projects/creator'), { recursive: true });
      await writeFile(
        path.join(root, '.tmp/share-projects/creator/my-album.json'),
        JSON.stringify({
          id: project.id,
          name: project.name,
          scope: 'creator',
          accountId: project.accountId,
        })
      );
    }
    await writeFile(path.join(root, 'package.json'), '{}');
    const ballot = '{"votes":{"unrelated":1}}';
    await writeFile(path.join(root, '.tmp/album-preview-ballot.json'), ballot);
    const runner = createRunner({ dryRun: false });
    const run = vi.spyOn(runner, 'run').mockImplementation(() => {
      throw new Error('Unexpected external command');
    });
    const vercel = vi.spyOn(runner, 'vercel').mockImplementation(args => {
      let result: unknown = {};
      if (args[0] === 'api') {
        expect(args).not.toContain('POST');
        if (origin === 'previous static') expect(args).toContain(`/v9/projects/${project.id}`);
        result = project;
      }
      if (args[0] === 'env' && args[1] === 'ls')
        result = {
          envs: ['DATABASE_URL', 'BLOB_STORE_ID', 'ALBUM_WRITE_TOKEN'].map(key => ({ key })),
        };
      if (args[0] === 'deploy') {
        const stage = args[args.indexOf('--cwd') + 1]!;
        expect(args).toContain('prj_album');
        expect(args).toContain(`albumKitRevision=${revision}`);
        expect(JSON.parse(readFileSync(path.join(stage, 'package.json'), 'utf8')).name).toBe(
          'album-kit'
        );
        expect(
          readFileSync(path.join(stage, 'src/app/vote/[[...parts]]/page.tsx'), 'utf8')
        ).toContain('listenerJudgingView');
        expect(JSON.parse(readFileSync(path.join(stage, 'album/album.json'), 'utf8'))).toEqual(
          album
        );
        expect(
          JSON.parse(readFileSync(path.join(stage, 'album/public-streams.json'), 'utf8'))
        ).toEqual([take]);
        expect(existsSync(path.join(stage, 'index.html'))).toBe(false);
        result = {
          deployment: {
            projectId: project.id,
            target: 'production',
            readyState: 'READY',
            productionUrl: origin === 'hosted' ? 'https://other-alias.vercel.app' : siteUrl,
          },
        };
      }
      return { stdout: JSON.stringify(result), stderr: '', status: 0, shown: args[0] ?? '' };
    });
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.host === 'api.github.com') {
        expect(url.pathname).toBe(`/repos/sashakhad/album-kit/git/commits/${revision}`);
        expect(new Headers(init?.headers).get('authorization')).toBeNull();
        return Response.json({ sha: revision });
      }
      if (url.href === take.streamUrl)
        return new Response('media', { status: 206, headers: { 'content-type': 'video/mp4' } });
      expect(url.origin).toBe(siteUrl);
      if (url.pathname === '/api/votes') return Response.json({ currentRound: 1 });
      if (url.pathname === '/vote')
        return publicPage(
          `<h1>Compare takes</h1><button aria-label="Add one to take A of My Track"></button><video src="${take.streamUrl}"></video>`
        );
      if (url.pathname === '/listen')
        return publicPage(`<h1>Two &amp; Three</h1><video src="${take.streamUrl}"></video>`);
      throw new Error('Unexpected request');
    });
    expect(existsSync(path.join(root, '.git'))).toBe(false);
    expect(
      await shareAlbum(
        root,
        { project: project.name, scope: 'creator', ref: revision },
        runner,
        request
      )
    ).toMatchObject({
      url: `${siteUrl}/vote`,
      edition: 'full',
      project: project.name,
      projectId: project.id,
      accountId: project.accountId,
      scope: 'creator',
      kitRevision: revision,
    });
    expect(vercel.mock.calls.filter(([args]) => args[0] === 'deploy')).toHaveLength(1);
    expect(
      vercel.mock.calls.some(
        ([args]) => args[0] === 'integration' || args[0] === 'blob' || args[1] === 'add'
      )
    ).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(path.join(root, '.album-site.json'), 'utf8'))).toMatchObject({
      deployedKitRevision: revision,
      projectId: project.id,
      siteUrl,
    });
    expect(await publish('Publish music update', root, runner, request)).toBe(`${siteUrl}/vote`);
    expect(vercel.mock.calls.filter(([args]) => args[0] === 'deploy')).toHaveLength(2);
    expect(
      request.mock.calls.filter(([input]) => new URL(String(input)).host === 'api.github.com')
    ).toHaveLength(1);
    expect(await readFile(path.join(root, '.tmp/album-preview-ballot.json'), 'utf8')).toBe(ballot);
  }
);

it('rejects a healthy but unrelated album before sending a voting link', async () => {
  await expect(
    verifyFullAlbum(siteUrl, album, async () => publicPage('<h1>Another album</h1>'))
  ).rejects.toThrow('this album');
});
