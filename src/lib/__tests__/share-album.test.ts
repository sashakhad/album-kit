// @vitest-environment node
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prepareShare, shareAlbum, verifyShare } from '../../../scripts/share-album.mjs';
import { createRunner } from '../../../scripts/setup.mjs';

const options = { project: 'porch-listen', scope: 'owner-team' };
const url = 'https://porch-listen.vercel.app/';
let root: string;
let exported: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'album-share-test-'));
  await mkdir(path.join(root, 'album', 'audio'), { recursive: true });
  await mkdir(path.join(root, '.tmp', 'album-preview', 'audio'), { recursive: true });
  await writeFile(
    path.join(root, 'album', 'album.json'),
    JSON.stringify({
      title: 'Porch',
      sets: [{ id: 'v1' }],
      tracks: [{ number: 1, title: 'Porch', slug: 'porch' }],
    })
  );
  await writeFile(path.join(root, 'album', 'audio', 'v1-01-porch-p1-takea.mp3'), 'ID3 public take');
  await writeFile(
    path.join(root, '.tmp', 'album-preview-streams.json'),
    JSON.stringify([
      {
        filename: 'v1-01-porch-p1-takeb.mp3',
        clipId: 'takeB',
        streamUrl: 'https://cdn1.suno.ai/takeB.mp4',
      },
    ])
  );
  await writeFile(path.join(root, '.tmp', 'album-preview', 'audio', 'leftover.mp3'), 'old take');
  await writeFile(path.join(root, '.env'), 'private');
  await writeFile(path.join(root, '.tmp', 'album-preview-ballot.json'), 'private');
});

afterEach(async () => {
  if (exported) await rm(exported, { recursive: true, force: true });
  exported = undefined;
  await rm(root, { recursive: true, force: true });
});

describe('public listening app', () => {
  it('publishes just the fresh index and the audio referenced by that index', async () => {
    const snapshot = await prepareShare(root);
    exported = snapshot.directory;
    expect((await readdir(snapshot.directory)).sort()).toEqual(['audio', 'index.html']);
    const audio = await readdir(path.join(snapshot.directory, 'audio'));
    expect(audio).toHaveLength(1);
    expect(audio).not.toContain('leftover.mp3');
    const html = await readFile(path.join(snapshot.directory, 'index.html'), 'utf8');
    expect(html).toContain(`audio/${audio[0]}`);
    expect(html).toContain('https://cdn1.suno.ai/takeB.mp4');
    expect(html).not.toContain('v1-01-porch');
  });

  it('creates a dedicated project and reuses its ID on retry after a deploy failure', async () => {
    const runner = createRunner({ dryRun: false });
    let html: string;
    let attempt = 0;
    const calls: string[][] = [];
    vi.spyOn(runner, 'vercel').mockImplementation(args => {
      calls.push(args);
      expect(args).toContain('--scope');
      expect(args[args.indexOf('--scope') + 1]).toBe('owner-team');
      if (args[0] === 'api') {
        return {
          status: 0,
          stdout: '{"name":"porch-listen","id":"prj_owned"}',
          stderr: '',
          shown: 'create',
        };
      }
      expect(args).toContain('prj_owned');
      exported = args[args.indexOf('--cwd') + 1];
      return ++attempt === 1
        ? { status: 1, stdout: '', stderr: 'Interrupted', shown: 'deploy' }
        : {
            status: 0,
            stdout: JSON.stringify({
              deployment: { productionUrl: url, readyState: 'READY', target: 'production' },
            }),
            stderr: '',
            shown: 'deploy',
          };
    });
    const media: string[] = [];
    const request: typeof fetch = async (input, init) => {
      const address = String(input);
      if (address === url && exported) {
        html = await readFile(path.join(exported, 'index.html'), 'utf8');
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }
      media.push(address);
      expect(init?.headers).toEqual({ Range: 'bytes=0-31' });
      return new Response('audio bytes', {
        status: 206,
        headers: { 'content-type': 'audio/mpeg' },
      });
    };
    await expect(shareAlbum(root, options, runner, request)).rejects.toThrow('Interrupted');
    await expect(shareAlbum(root, options, runner, request)).resolves.toBe(url);
    expect(calls.map(args => args[0])).toEqual(['api', 'deploy', 'deploy']);
    expect(media).toHaveLength(2);
  });

  it('never adopts an existing project with a matching name', async () => {
    const runner = createRunner({ dryRun: false });
    const run = vi.spyOn(runner, 'vercel').mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'project already exists',
      shown: 'create',
    });
    await expect(shareAlbum(root, options, runner)).rejects.toThrow('project already exists');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rejects a protected page, old album, and non-playable audio', async () => {
    const snapshot = await prepareShare(root);
    exported = snapshot.directory;
    const html = await readFile(path.join(snapshot.directory, 'index.html'), 'utf8');
    const page = (body: string) => new Response(body, { headers: { 'content-type': 'text/html' } });
    await expect(
      verifyShare(url, snapshot, async () => new Response(null, { status: 401 }))
    ).rejects.toThrow('publicly accessible');
    await expect(verifyShare(url, snapshot, async () => page('Previous album'))).rejects.toThrow(
      'does not show this album'
    );
    await expect(
      verifyShare(url, snapshot, async input =>
        String(input) === url ? page(html) : page('Sign in')
      )
    ).rejects.toThrow('audio did not play');
  });

  it('cannot share an empty album', async () => {
    await rm(path.join(root, 'album', 'audio'), { recursive: true });
    await writeFile(path.join(root, '.tmp', 'album-preview-streams.json'), '[]');
    const runner = createRunner({ dryRun: false });
    const run = vi.spyOn(runner, 'vercel');
    await expect(shareAlbum(root, options, runner)).rejects.toThrow('Generate a playable take');
    expect(run).not.toHaveBeenCalled();
  });
});
