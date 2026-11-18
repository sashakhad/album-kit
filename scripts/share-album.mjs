#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { preview } from './preview-album.mjs';
import { createRunner } from './setup.mjs';

const usage =
  'Usage: pnpm share:album --project <new-album-project> --scope <owner-scope>, or pnpm share:album --prepare';

export async function prepareShare(root) {
  const directory = await mkdtemp(path.join(tmpdir(), 'album-share-'));
  try {
    const { report, sources } = await preview(root, { output: directory });
    if (!sources.length) throw new Error('Generate a playable take before sharing this album.');
    await rename(report.page, path.join(directory, 'index.html'));
    return { directory, sources };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function shareProject(root, project, scope, vercel) {
  // Store the exact project ID locally. A name collision must never replace another album.
  const stateDir = path.join(root, '.tmp', 'share-projects', scope);
  const filename = path.join(stateDir, project + '.json');
  try {
    const saved = JSON.parse(await readFile(filename, 'utf8'));
    if (saved.name !== project || saved.scope !== scope || !/^prj_[\w-]+$/.test(saved.id)) {
      throw new Error('The saved share project is invalid. Choose a new album project name.');
    }
    return saved.id;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await mkdir(stateDir, { recursive: true });
  const created = vercel([
    'api',
    '/v10/projects',
    '--method',
    'POST',
    '--raw-field',
    'name=' + project,
    '--raw',
  ]);
  if (created.name !== project || !/^prj_[\w-]+$/.test(created.id)) {
    throw new Error('Vercel did not confirm the new album project.');
  }
  const pending = filename + '.' + process.pid;
  await writeFile(pending, JSON.stringify({ name: project, scope, id: created.id }), {
    mode: 0o600,
    flag: 'wx',
  });
  await rename(pending, filename);
  return created.id;
}

async function verifyMedia(url, request) {
  const response = await request(url, {
    headers: { Range: 'bytes=0-31' },
    signal: AbortSignal.timeout(8000),
  });
  const type = response.headers.get('content-type') ?? '';
  const reader = response.body?.getReader();
  try {
    if (![200, 206].includes(response.status) || !reader) return false;
    const { value } = await reader.read();
    if (!value?.byteLength) return false;
    if (/^(audio|video)\//i.test(type)) return true;
    // Some CDNs serve an MP3 or MP4 as a generic binary.
    const bytes = Buffer.from(value);
    return (
      (type === '' || /^application\/octet-stream\b/i.test(type)) &&
      (bytes.toString('ascii', 0, 3) === 'ID3' ||
        (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) ||
        bytes.toString('ascii', 4, 8) === 'ftyp')
    );
  } finally {
    await reader?.cancel();
  }
}

export async function verifyShare(url, { directory, sources }, request = fetch) {
  const page = await request(url, { signal: AbortSignal.timeout(8000) });
  if (!page.ok || !/^text\/html\b/i.test(page.headers.get('content-type') ?? '')) {
    await page.body?.cancel();
    throw new Error(
      'The album page is not publicly accessible. Check the project’s production access.'
    );
  }
  const html = await readFile(path.join(directory, 'index.html'), 'utf8');
  if ((await page.text()) !== html)
    throw new Error('The public link does not show this album yet.');
  // Exercise both delivery paths if the album mixes local files and Suno streams.
  const samples = [
    sources.find(src => src.startsWith('audio/')),
    sources.find(src => src.startsWith('https://')),
  ].filter(Boolean);
  const results = await Promise.all(samples.map(src => verifyMedia(new URL(src, url), request)));
  if (!results.length || results.includes(false)) {
    throw new Error(
      'The public album opened, but its audio did not play. Check the media and retry sharing.'
    );
  }
}

export async function shareAlbum(
  root,
  { project, scope },
  runner = createRunner({ dryRun: false }),
  request = fetch
) {
  if (
    ![project, scope].every(
      value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value)
    )
  ) {
    throw new Error(usage);
  }
  const snapshot = await prepareShare(root);
  try {
    const vercel = args =>
      JSON.parse(
        runner.must(runner.vercel([...args, '--scope', scope, '--cwd', snapshot.directory])).stdout
      );
    const id = await shareProject(root, project, scope, vercel);
    const result = vercel(['deploy', '--project', id, '--prod', '--yes', '--json']);
    const deployment = result.deployment ?? result;
    const url = new URL(deployment.productionUrl ?? deployment.url);
    if (
      deployment.readyState !== 'READY' ||
      deployment.target !== 'production' ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error('Vercel did not return a ready production album link.');
    }
    for (const delay of [0, 1000, 3000]) {
      if (delay) await wait(delay);
      try {
        await verifyShare(url, snapshot, request);
        return url.href;
      } catch (error) {
        if (delay === 3000) throw error;
      }
    }
  } finally {
    await rm(snapshot.directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      options: {
        prepare: { type: 'boolean' },
        project: { type: 'string' },
        scope: { type: 'string' },
      },
    });
    if (values.prepare) {
      if (values.project || values.scope) throw new Error(usage);
      const { directory } = await prepareShare(process.cwd());
      console.log(JSON.stringify({ directory }));
    } else {
      const url = await shareAlbum(process.cwd(), values);
      console.log(JSON.stringify({ url }));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
