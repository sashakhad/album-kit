#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { preview } from './preview-album.mjs';
import { createRunner, readAlbumSite, setup } from './setup.mjs';
import { localPublicStreams } from './hosted-app.mjs';
import { verifiedScaffold } from './hosted-source.mjs';
import { parseCanonicalTake } from '../src/lib/album/parse-filename.ts';
import { parseSunoStreamUrl } from '../src/lib/album/stream-url.ts';

const usage =
  'Usage: pnpm share:album --project <album-project> --scope <owner-scope> [--ref <kit-ref>], or pnpm share:album --prepare (Lite only)';
const accountIdPattern = /^[A-Za-z0-9_]{4,80}$/;

export async function shareMode(root) {
  let mode;
  try {
    mode = JSON.parse(await readFile(path.join(root, '.album-onboarding.json'), 'utf8')).path;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (['full', 'studio'].includes(mode)) return 'full';
  if (['light', 'lite', 'quick'].includes(mode)) return 'light';
  const existing = readAlbumSite(root);
  return existing?.project && existing?.siteUrl ? 'full' : 'light';
}

export async function prepareShare(root) {
  const directory = await mkdtemp(path.join(tmpdir(), 'album-share-'));
  try {
    const { report, sources } = await preview(root, {
      output: directory,
      // The public site is one player. The chat attachment cap does not apply.
      pageBudgetBytes: Number.POSITIVE_INFINITY,
    });
    if (!sources.length) throw new Error('Generate a playable take before sharing this album.');
    await rename(report.page, path.join(directory, 'index.html'));
    return { directory, sources };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function savedStaticProject(root, project, scope) {
  if (
    ![project, scope].every(
      value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value)
    )
  )
    return null;
  try {
    const saved = JSON.parse(
      await readFile(path.join(root, '.tmp', 'share-projects', scope, project + '.json'), 'utf8')
    );
    if (saved.name !== project || saved.scope !== scope || !/^prj_[\w-]+$/.test(saved.id)) {
      throw new Error('The saved share project is invalid. Choose a new album project name.');
    }
    if (!accountIdPattern.test(saved.accountId ?? '')) {
      throw new Error('The saved share project does not name its Vercel account.');
    }
    return { project, scope, projectId: saved.id, accountId: saved.accountId };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function confirmedProject(created, project) {
  if (
    created?.name !== project ||
    !/^prj_[\w-]+$/.test(created?.id ?? '') ||
    !accountIdPattern.test(created?.accountId ?? '')
  ) {
    throw new Error('Vercel did not confirm the album project and account.');
  }
  return { project, projectId: created.id, accountId: created.accountId };
}

async function rememberProject(root, scope, identity) {
  const filename = path.join(root, '.tmp', 'share-projects', scope, identity.project + '.json');
  await mkdir(path.dirname(filename), { recursive: true });
  const pending = filename + '.' + process.pid;
  await writeFile(
    pending,
    JSON.stringify({
      name: identity.project,
      scope,
      id: identity.projectId,
      accountId: identity.accountId,
    }),
    { mode: 0o600 }
  );
  await rename(pending, filename);
}

async function shareProject(root, project, scope, vercel) {
  const saved = await savedStaticProject(root, project, scope);
  if (saved) {
    const live = confirmedProject(
      vercel(['api', '/v9/projects/' + saved.projectId, '--raw']),
      project
    );
    if (live.projectId !== saved.projectId || live.accountId !== saved.accountId) {
      throw new Error('Vercel did not confirm the saved album project and account.');
    }
    return { ...saved, scope };
  }
  const created = confirmedProject(
    vercel(['api', '/v10/projects', '--method', 'POST', '--raw-field', 'name=' + project, '--raw']),
    project
  );
  const identity = { ...created, scope };
  await rememberProject(root, scope, identity);
  return identity;
}

function productionUrl(result, projectId) {
  const deployment = result.deployment ?? result;
  const deployedProjectId = deployment.projectId ?? result.projectId;
  if (typeof deployedProjectId !== 'string' || deployedProjectId.length === 0) {
    throw new Error('Vercel did not name the project for this deployment.');
  }
  if (deployedProjectId !== projectId) {
    throw new Error('Vercel deployed a different project than this album.');
  }
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
  return url;
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

function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[char]
  );
}

export async function verifyFullAlbum(siteUrl, album, request = fetch, expectedStreams = []) {
  const origin = new URL(siteUrl);
  const [listen, vote] = await Promise.all(
    ['/listen', '/vote'].map(async route => {
      const page = await request(new URL(route, origin), {
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
      if (!page.ok || !/^text\/html\b/i.test(page.headers.get('content-type') ?? '')) {
        throw new Error('The signed-out album page could not open: ' + route);
      }
      return page.text();
    })
  );
  const title = /<h1\b[^>]*>([^<]*)<\/h1>/i.exec(listen)?.[1];
  const hasTrack = album.tracks.some(
    track => !track.parked && vote.includes(' of ' + escapeHtml(track.title) + '"')
  );
  if (
    title !== escapeHtml(album.title) ||
    !hasTrack ||
    !vote.includes('aria-label="Add one to take ')
  ) {
    throw new Error('The public pages did not show this album and its listener voting controls.');
  }
  const sources = [listen, vote].map(html => {
    const src = /<(?:audio|video)\b[^>]*?\ssrc="([^"]+)"/i.exec(html)?.[1];
    if (!src)
      throw new Error(
        'The public player has no playable take yet. Check its stream catalog or audio upload.'
      );
    const target = new URL(src, origin);
    if (
      !parseSunoStreamUrl(target.href) &&
      !(target.origin === origin.origin && target.pathname.startsWith('/api/'))
    ) {
      throw new Error('The public player returned an unexpected media source.');
    }
    return target.href;
  });
  if (expectedStreams.length && !expectedStreams.some(entry => vote.includes(entry.streamUrl)))
    throw new Error('The listener ballot does not include the generated album audio.');
  const probes = await Promise.all([...new Set(sources)].map(url => verifyMedia(url, request)));
  if (probes.includes(false))
    throw new Error('The album is online but the signed-out player could not load its audio.');
  return new URL('/vote', origin).href;
}

export async function shareVotingApp(root, options, runner, request) {
  const album = JSON.parse(await readFile(path.join(root, 'album/album.json'), 'utf8'));
  const streams = await localPublicStreams(root, album);
  const linked = new Set(streams.map(entry => entry.filename));
  const files = await readdir(path.join(root, 'album/audio'), { withFileTypes: true }).catch(
    error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  );
  const uploads = files
    .filter(file => {
      const take = parseCanonicalTake(file.name);
      return (
        file.isFile() &&
        !linked.has(file.name) &&
        take &&
        album.sets.some(set => set.id === take.setId) &&
        album.tracks.some(
          track => !track.parked && track.number === take.trackNumber && track.slug === take.slug
        )
      );
    })
    .map(file => path.join(root, 'album/audio', file.name));
  const existing = readAlbumSite(root);
  if (!uploads.length && !streams.length && !existing?.siteUrl)
    throw new Error('Generate a playable take before sharing this album.');
  if (!options.scope && !existing?.siteUrl) throw new Error(usage);
  const savedStatic = !existing
    ? await savedStaticProject(root, options.project, options.scope)
    : null;
  const previousStatic = savedStatic ? { ...savedStatic, orgId: savedStatic.accountId } : null;
  const source = await verifiedScaffold(root, options.ref ?? 'main', request, existing);
  try {
    const site = await setup(
      {
        name: options.project,
        scope: options.scope,
        previousStatic,
        source: { ...source, preferredUrl: existing?.siteUrl },
      },
      root,
      runner,
      request
    );
    if (uploads.length)
      runner.must(
        runner.run(
          process.execPath,
          [fileURLToPath(new URL('./takes-upload.mjs', import.meta.url)), ...uploads],
          { cwd: root }
        )
      );
    const url = await verifyFullAlbum(
      site.siteUrl,
      album,
      request,
      existing?.siteUrl ? [] : streams
    );
    if (!/^prj_[\w-]+$/.test(site.projectId ?? '') || !accountIdPattern.test(site.orgId ?? '')) {
      throw new Error('Vercel did not confirm the album project and account.');
    }
    return {
      url,
      edition: 'full',
      project: site.project,
      projectId: site.projectId,
      accountId: site.orgId,
      scope: site.scope,
      kitRevision: site.deployedKitRevision,
    };
  } finally {
    await source.cleanup();
  }
}

export async function shareAlbum(
  root,
  options,
  runner = createRunner({ dryRun: false, scope: options.scope ?? '', cwd: root }),
  request = fetch
) {
  if ((await shareMode(root)) === 'full') return shareVotingApp(root, options, runner, request);
  const { project, scope } = options;
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
    const identity = await shareProject(root, project, scope, vercel);
    const result = vercel(['deploy', '--project', identity.projectId, '--prod', '--yes', '--json']);
    const url = productionUrl(result, identity.projectId);
    for (const delay of [0, 1000, 3000]) {
      if (delay) await wait(delay);
      try {
        await verifyShare(url, snapshot, request);
        return {
          url: url.href,
          edition: 'light',
          project: identity.project,
          projectId: identity.projectId,
          accountId: identity.accountId,
          scope: identity.scope,
        };
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
        ref: { type: 'string' },
      },
    });
    if (values.prepare) {
      if ((await shareMode(process.cwd())) === 'full')
        throw new Error('Full Setup shares the voting app. Run share:album without --prepare.');
      if (values.project || values.scope || values.ref) throw new Error(usage);
      const { directory } = await prepareShare(process.cwd());
      console.log(JSON.stringify({ directory }));
    } else {
      const destination = await shareAlbum(process.cwd(), values);
      console.log(JSON.stringify(destination));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
