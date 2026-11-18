import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { parseCanonicalTake } from '../src/lib/album/parse-filename.ts';
import { publicStreamEntries } from '../src/lib/album/stream-url.ts';

const projectPattern = /^[a-z0-9][a-z0-9-]{0,99}$/;
const scopePattern = /^[A-Za-z0-9][\w-]{0,99}$/;
const projectIdPattern = /^prj_[\w-]+$/;

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temp, file);
}

function projectAliases(project) {
  return (project.targets?.production?.alias ?? []).filter(alias => typeof alias === 'string');
}

/** Resolve an existing album link or reserve a new project. Never adopt a name collision. */
export async function hostedProject(root, { name, scope = '', site = null, create }, runner) {
  if (!projectPattern.test(name) || (scope && !scopePattern.test(scope))) {
    throw new Error('A valid Vercel project and account scope are required.');
  }
  const linkFile = path.join(root, '.vercel', 'project.json');
  const link = await readJson(linkFile);
  if (
    (link && (!projectIdPattern.test(link.projectId) || !link.orgId)) ||
    (site?.project && site.project !== name) ||
    (site?.projectId && link && site.projectId !== link.projectId)
  ) {
    throw new Error('The saved album and the local Vercel link point to different projects.');
  }
  const savedId = link?.projectId ?? site?.projectId;
  const owner = link?.orgId ?? site?.orgId;
  const selectedScope = scope || site?.scope || owner;
  if (
    (process.env.VERCEL_PROJECT_ID && process.env.VERCEL_PROJECT_ID !== savedId) ||
    (process.env.VERCEL_ORG_ID && process.env.VERCEL_ORG_ID !== owner)
  ) {
    throw new Error(
      'The configured Vercel environment points to another project or account. Check the album link.'
    );
  }
  const args = selectedScope ? ['--scope', selectedScope] : [];
  const api = command => JSON.parse(runner.must(runner.vercel([...command, ...args])).stdout);
  let project;
  if (savedId || site?.siteUrl) {
    project = api(['api', '/v9/projects/' + encodeURIComponent(savedId ?? name), '--raw']);
    // Older site records have just a project name and URL. Confirm its production domain before adopting it.
    if (!savedId && !projectAliases(project).includes(new URL(site.siteUrl).hostname)) {
      throw new Error('The existing album URL does not belong to this Vercel project.');
    }
  } else if (create) {
    project = api([
      'api',
      '/v10/projects',
      '--method',
      'POST',
      '--raw-field',
      'name=' + name,
      '--raw-field',
      'framework=nextjs',
      '--raw',
    ]);
  } else {
    throw new Error('This folder has no verified Vercel project. Run pnpm setup:site first.');
  }
  if (
    project.name !== name ||
    !projectIdPattern.test(project.id) ||
    !project.accountId ||
    (savedId && project.id !== savedId) ||
    (owner && project.accountId !== owner)
  ) {
    throw new Error('Vercel did not confirm the saved album project and account.');
  }
  await saveJson(linkFile, {
    ...link,
    orgId: project.accountId,
    projectId: project.id,
    projectName: name,
  });
  return {
    project: name,
    projectId: project.id,
    orgId: project.accountId,
    scope: selectedScope ?? project.accountId,
    aliases: projectAliases(project),
  };
}

const buildFiles = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'next.config.ts',
  'tsconfig.json',
  'postcss.config.mjs',
  'prisma.config.ts',
  'vercel.json',
  'scripts/vercel-build.mjs',
];
const directories = {
  src: /\.(?:[cm]?[jt]sx?|json|css|svg|woff2?|ico|png|jpg|webp|webmanifest)$/,
  public: /\.(?:css|js|svg|woff2?|ico|png|jpe?g|webp|gif|webmanifest|avif)$/,
  prisma: /\.(?:prisma|sql|toml)$/,
};

async function readAlbumStreams(directory, basename) {
  const file = path.join(directory, basename);
  try {
    if (!(await lstat(directory)).isDirectory() || !(await lstat(file)).isFile()) {
      throw new Error('Expected an ordinary album stream catalog.');
    }
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function localPublicStreams(root, album) {
  const current = await readAlbumStreams(path.join(root, '.tmp'), 'album-preview-streams.json');
  const input =
    current ?? (await readAlbumStreams(path.join(root, 'album'), 'public-streams.json'));
  if (input === null) return [];
  const sets = new Set(album.sets.map(set => set.id));
  const tracks = new Map(
    album.tracks.filter(track => !track.parked).map(track => [track.number, track.slug])
  );
  return publicStreamEntries(input).filter(({ filename }) => {
    const take = parseCanonicalTake(filename);
    return take && sets.has(take.setId) && tracks.get(take.trackNumber) === take.slug;
  });
}

export async function stageHostedApp(root, kitRoot = root) {
  const stage = await mkdtemp(path.join(tmpdir(), 'album-hosted-'));
  async function copy(file, source = kitRoot) {
    const destination = path.join(stage, file);
    if (!(await lstat(path.join(source, file))).isFile())
      throw new Error('Expected an album file: ' + file);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(source, file), destination);
  }
  async function tree(dir, pattern) {
    for (const entry of await readdir(path.join(kitRoot, dir), { withFileTypes: true })) {
      if (
        entry.name.startsWith('.') ||
        ['__tests__', '__mocks__', 'generated', 'node_modules'].includes(entry.name)
      )
        continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await tree(file, pattern);
      if (entry.isFile() && pattern.test(entry.name)) await copy(file);
    }
  }
  try {
    // Stage only build inputs. Source control metadata, credentials, raw audio, and generation ledgers stay local.
    if (!(await lstat(path.join(root, 'album'))).isDirectory())
      throw new Error('Expected an album directory.');
    for (const dir of ['scripts', ...Object.keys(directories)]) {
      if (!(await lstat(path.join(kitRoot, dir))).isDirectory())
        throw new Error('Expected an album directory: ' + dir);
    }
    for (const file of buildFiles) await copy(file);
    for (const [dir, pattern] of Object.entries(directories)) await tree(dir, pattern);
    await copy('album/album.json', root);
    const album = await readJson(path.join(stage, 'album/album.json'));
    const publicTakes = await localPublicStreams(root, album);
    if (publicTakes.length)
      await saveJson(path.join(stage, 'album/public-streams.json'), publicTakes);
    const sheets = await lstat(path.join(root, 'album/tracks')).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (sheets && !sheets.isDirectory()) throw new Error('Expected an album/tracks directory.');
    if (sheets) {
      for (const track of album.tracks) {
        if (!Number.isInteger(track.number) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(track.slug))
          throw new Error('Invalid track in album.json.');
        const file = `album/tracks/${String(track.number).padStart(2, '0')}-${track.slug}.md`;
        await copy(file, root).catch(error => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
    }
    return stage;
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

export async function checkVotingApp(siteUrl, request = fetch) {
  const url = new URL(siteUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Vercel returned an invalid production URL.');
  }
  const get = pathname =>
    request(new URL(pathname, url), { redirect: 'error', signal: AbortSignal.timeout(12000) });
  const [page, votes] = await Promise.all([get('/vote'), get('/api/votes')]);
  if (
    !page.ok ||
    !votes.ok ||
    !/text\/html/i.test(page.headers.get('content-type') ?? '') ||
    !(await page.text()).includes('Compare takes') ||
    !Number.isInteger((await votes.json()).currentRound)
  ) {
    throw new Error('The public comparison page and listener ballot are not ready.');
  }
  return url.origin;
}

export async function deployHostedApp(root, project, runner, request = fetch, source = null) {
  const directory = await stageHostedApp(root, source?.directory ?? root);
  try {
    const result = runner.must(
      runner.vercel([
        'deploy',
        '--project',
        project.projectId,
        '--scope',
        project.scope,
        '--cwd',
        directory,
        ...(source ? ['--meta', 'albumKitRevision=' + source.revision] : []),
        '--prod',
        '--yes',
        '--json',
      ])
    );
    const payload = JSON.parse(result.stdout);
    const deployment = payload.deployment ?? payload;
    if (
      deployment.readyState !== 'READY' ||
      deployment.target !== 'production' ||
      !deployment.productionUrl
    ) {
      throw new Error('Vercel did not return a ready production alias for this album.');
    }
    for (const delay of [0, 1000, 3000]) {
      if (delay) await sleep(delay);
      try {
        const siteUrl = await checkVotingApp(
          source?.preferredUrl && project.aliases.includes(new URL(source.preferredUrl).hostname)
            ? source.preferredUrl
            : deployment.productionUrl,
          request
        );
        // The album backup can now restore these public clips even without the local preview cache.
        const published = await readJson(path.join(directory, 'album/public-streams.json'));
        if (
          published ||
          (await readAlbumStreams(path.join(root, 'album'), 'public-streams.json'))
        ) {
          await saveJson(path.join(root, 'album/public-streams.json'), published ?? []);
        }
        return siteUrl;
      } catch (error) {
        if (delay === 3000) throw error;
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
