#!/usr/bin/env node
// Provision the creator's Vercel voting app and publish it directly from local files.
// Exit codes: 0 done, 1 failed, 2 Vercel sign-in needed, 3 finish Neon in the browser.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { checkVotingApp, deployHostedApp, hostedProject, saveJson } from './hosted-app.mjs';

export const VERCEL_CLI = 'vercel@65.11.0';

export const EXIT = {
  ok: 0,
  failed: 1,
  notSignedIn: 2,
  neonNeedsBrowser: 3,
  noAccountEmail: 4,
  noGitHub: 5,
};

export class ExitError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createRunner({ dryRun, scope = '', cwd = process.cwd() }) {
  function run(command, args, options = {}) {
    const shown = [command, ...args.map((arg, index) => maskArg(args, index, arg, options))]
      .map(quote)
      .join(' ');
    if (dryRun) {
      console.log(options.when === undefined ? shown : `${shown}   # ${options.when}`);
      return { status: 0, stdout: '', stderr: '', shown };
    }

    console.log(`$ ${shown}`);
    const result = spawnSync(command, args, {
      cwd: options.cwd ?? cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
    });
    return {
      status: result.error === undefined ? (result.status ?? 1) : 1,
      stdout: result.stdout ?? '',
      stderr: result.error === undefined ? (result.stderr ?? '') : result.error.message,
      shown,
    };
  }

  function vercel(args, options) {
    const globalScope = scope && !args.includes('--scope') ? ['--scope', scope] : [];
    return run('npx', ['--yes', VERCEL_CLI, ...args, ...globalScope], options);
  }

  function must(result) {
    if (result.status !== 0) {
      throw new ExitError(EXIT.failed, `Failed: ${result.shown}\n${result.stderr.trim()}`);
    }
    return result;
  }

  return { dryRun, run, vercel, must };
}

const GITHUB_SIGNED_OUT =
  'GitHub CLI is not signed in, so no GitHub backup was created. This album only has the kit remote. Run gh auth login, then run pnpm album:github.';
const GITHUB_MISSING =
  'GitHub CLI (gh) is not installed, so no GitHub backup was created. This album only has the kit remote. Install gh, run gh auth login, then run pnpm album:github.';

/** Create a public GitHub backup or confirm its existing origin. */
export function ensureGitHubRepo(runner, { project }) {
  const kit = runner.run('git', ['remote', 'get-url', 'kit']);
  const origin = runner.run('git', ['remote', 'get-url', 'origin']);
  const kitRepo = kit.status === 0 ? repoPath(kit.stdout) : null;
  if (runner.dryRun) {
    runner.run('gh', ['auth', 'status'], { when: 'if origin is missing' });
    runner.run(
      'gh',
      ['repo', 'create', project, '--public', '--source', '.', '--remote', 'origin', '--push'],
      { when: 'if gh is signed in and origin is missing' }
    );
    return { ok: true, blocker: null, url: null };
  }
  if (origin.status === 0) {
    const originRepo = repoPath(origin.stdout);
    if (originRepo === 'sashakhad/album-kit' || (originRepo !== null && originRepo === kitRepo)) {
      return {
        ok: false,
        blocker:
          'origin points at the album kit. Refusing to push this album there. Remove that origin, then run pnpm album:github.',
        url: null,
      };
    }
    if (
      !originRepo ||
      !/^(?:https?:\/\/(?:[^/]*@)?|(?:ssh:\/\/)?git@)github\.com[/:]/i.test(origin.stdout.trim())
    ) {
      return {
        ok: false,
        blocker: 'The origin remote does not name a GitHub repository.',
        url: null,
      };
    }
    return confirmBackupRepo(runner, originRepo);
  }
  const auth = runner.run('gh', ['auth', 'status']);
  if (auth.status !== 0) {
    return { ok: false, blocker: githubCliBlocker(auth), url: null };
  }
  const created = runner.run('gh', [
    'repo',
    'create',
    project,
    '--public',
    '--source',
    '.',
    '--remote',
    'origin',
    '--push',
  ]);
  if (created.status !== 0) {
    const detail = firstLine(`${created.stderr}\n${created.stdout}`);
    return {
      ok: false,
      blocker: `Could not create a public GitHub repo named ${project}. ${detail}`.trim(),
      url: null,
    };
  }
  return confirmBackupRepo(runner, null);
}

function confirmBackupRepo(runner, originRepo) {
  const view = runner.run('gh', [
    'repo',
    'view',
    ...(originRepo ? [originRepo] : []),
    '--json',
    'url,isPrivate,nameWithOwner',
  ]);
  if (view.status !== 0) {
    const detail = firstLine(`${view.stderr}\n${view.stdout}`);
    const where = originRepo ?? 'the new repo';
    return {
      ok: false,
      blocker: `GitHub could not confirm ${where} as the album backup. ${detail}`.trim(),
      url: null,
    };
  }
  const info = parseJson(view.stdout);
  const name = typeof info?.nameWithOwner === 'string' ? info.nameWithOwner : 'the repo';
  if (info?.isPrivate !== true && info?.isPrivate !== false) {
    return {
      ok: false,
      blocker: `GitHub could not confirm ${name}.`.trim(),
      url: null,
    };
  }
  const url = info?.url;
  if (typeof url !== 'string' || !url.startsWith('https://github.com/')) {
    return { ok: false, blocker: 'GitHub did not return the backup repository URL.', url: null };
  }
  console.log(`GitHub: ${url} (${info.isPrivate ? 'private' : 'public'})`);
  return { ok: true, blocker: null, url };
}

function githubCliBlocker(result) {
  const text = `${result.stderr}\n${result.stdout}`;
  if (result.status === 127 || /ENOENT|not found/i.test(text)) {
    return GITHUB_MISSING;
  }
  return GITHUB_SIGNED_OUT;
}

function firstLine(text) {
  const line = text
    .split('\n')
    .map(item => item.trim())
    .find(item => item.length > 0);
  return line ?? '';
}

export function readAlbumSite(root = process.cwd()) {
  const site = parseJson(readText(path.join(root, '.album-site.json')));
  return site !== null && typeof site === 'object' ? site : null;
}

export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// vercel env pull can't read a Secret back, and writes this placeholder in its place.
const SENSITIVE_PLACEHOLDER = '[SENSITIVE]';

export function generateWriteToken() {
  return randomBytes(32).toString('base64url');
}

export function usableWriteToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  if (token.length < 32 || /\s/.test(token) || token === SENSITIVE_PLACEHOLDER) return null;
  return token;
}

export function readEnvFile(filePath) {
  const values = {};
  for (const line of (readText(filePath) ?? '').split('\n')) {
    const trimmed = line.trim();
    const eq = trimmed.indexOf('=');
    if (trimmed.length === 0 || trimmed.startsWith('#') || eq <= 0) {
      continue;
    }
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[trimmed.slice(0, eq)] = value;
  }
  return values;
}

function parseArgs(argv) {
  const options = { name: undefined, scope: undefined, dryRun: false, passwordStdin: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--password-stdin') {
      options.passwordStdin = true;
    } else if (arg === '--scope' && argv[index + 1]) {
      options.scope = argv[++index];
    } else if (arg === '--name') {
      options.name = argv[index + 1];
      index += 1;
      if (options.name === undefined || options.name.length === 0) {
        throw new ExitError(
          EXIT.failed,
          'Usage: pnpm setup:site [--name <project>] [--scope <owner-scope>] [--password-stdin] [--dry-run]'
        );
      }
    } else if (arg.startsWith('--name=')) {
      options.name = arg.slice('--name='.length);
    } else {
      throw new ExitError(
        EXIT.failed,
        `Unknown option ${arg}. Usage: pnpm setup:site [--name <project>] [--scope <owner-scope>] [--password-stdin] [--dry-run]`
      );
    }
  }
  return options;
}

const SASHA_ACCOUNT = /sasha-bayans-projects|\bsashabayan\b|\bsashakhad\b/i;

export function assertOwnerAccount(scope, identity = '') {
  const text = `${scope ?? ''}\n${identity ?? ''}`;
  if (SASHA_ACCOUNT.test(text)) {
    throw new ExitError(EXIT.failed, "Refusing to provision an album on Sasha's Vercel or Neon.");
  }
}

export function projectName(options, root) {
  if (options.name !== undefined) {
    return options.name;
  }
  const linked = parseJson(readText(path.join(root, '.vercel', 'project.json')));
  if (typeof linked?.projectName === 'string' && linked.projectName.length > 0) {
    return linked.projectName;
  }
  const album = parseJson(readText(path.join(root, 'album', 'album.json')));
  const fromTitle = typeof album?.title === 'string' ? slugify(album.title) : '';
  return fromTitle.length > 0 ? fromTitle : 'my-album';
}

function productionEnvKeys(runner) {
  const result = runner.must(runner.vercel(['env', 'ls', 'production', '--json']));
  const envs = parseJson(result.stdout)?.envs;
  const keys = new Set();
  for (const env of Array.isArray(envs) ? envs : []) {
    if (typeof env?.key === 'string') {
      keys.add(env.key);
    }
  }
  return keys;
}

export async function setup(
  options,
  root = process.cwd(),
  runner = createRunner(options),
  request = fetch
) {
  const existing = readAlbumSite(root);
  const name = options.name ?? existing?.project ?? projectName(options, root);
  assertOwnerAccount(options.scope, `${name}\n${existing?.orgId ?? ''}\n${existing?.scope ?? ''}`);
  if (options.dryRun) {
    console.log(
      `Dry run for ${name}${options.scope ? ` on ${options.scope}` : ''}. No Vercel, Neon, or GitHub call is made.`
    );
    console.log('Verify the signed-in Vercel account and reserve or reuse the album project.');
    console.log('Provision any missing Vercel Blob, Neon and album write token.');
    console.log(
      'Deploy the voting app directly to Vercel and check its public comparison page and ballot.'
    );
    return;
  }
  const whoami = runner.vercel(['whoami']);
  if (whoami.status !== 0)
    throw new ExitError(EXIT.notSignedIn, 'Not signed in to Vercel. Run: npx vercel login');
  assertOwnerAccount('', whoami.stdout);
  const project = await hostedProject(
    root,
    { name, scope: options.scope, site: existing ?? options.previousStatic, create: true },
    runner
  );
  const keys = productionEnvKeys(runner);
  const environmentReady =
    (keys.has('BLOB_READ_WRITE_TOKEN') || keys.has('BLOB_STORE_ID')) &&
    keys.has('DATABASE_URL') &&
    keys.has('ALBUM_WRITE_TOKEN');
  if (!keys.has('BLOB_READ_WRITE_TOKEN') && !keys.has('BLOB_STORE_ID')) {
    runner.must(
      runner.vercel(['blob', 'create-store', `${name}-audio`, '--access', 'public', '--yes'], {
        when: 'if neither a Blob token nor store ID is configured',
      })
    );
  }

  if (!keys.has('DATABASE_URL')) {
    const neon = runner.vercel(['integration', 'add', 'neon'], {
      when: 'if DATABASE_URL is missing',
    });
    if (neon.status !== 0 || !productionEnvKeys(runner).has('DATABASE_URL')) {
      const output = `${neon.stdout}${neon.stderr}`.trim();
      throw new ExitError(
        EXIT.neonNeedsBrowser,
        `${output.length > 0 ? `${output}\n` : ''}Finish the Neon step in the browser, then run pnpm setup:site again`
      );
    }
  }

  const envPath = path.join(root, '.env');
  let writeToken =
    usableWriteToken(readEnvFile(envPath).ALBUM_WRITE_TOKEN) ??
    usableWriteToken(readEnvFile(path.join(root, '.env.local')).ALBUM_WRITE_TOKEN);
  if (!keys.has('ALBUM_WRITE_TOKEN')) {
    writeToken ??= generateWriteToken();
    runner.must(
      runner.vercel(
        ['env', 'add', 'ALBUM_WRITE_TOKEN', 'production', '--value', writeToken, '--yes'],
        {
          when: 'if ALBUM_WRITE_TOKEN is missing; generated locally and never printed',
          secretAfter: '--value',
        }
      )
    );
    writeEnvKey(envPath, 'ALBUM_WRITE_TOKEN', writeToken);
  }

  runner.must(runner.vercel(['env', 'pull', '.env.local', '--environment', 'production', '--yes']));

  const { aliases, ...identity } = project;
  let siteUrl;
  if (
    !options.source &&
    environmentReady &&
    existing?.deploy === 'direct' &&
    existing.siteUrl &&
    aliases.includes(new URL(existing.siteUrl).hostname)
  ) {
    siteUrl = await checkVotingApp(existing.siteUrl, request).catch(() => null);
  }
  siteUrl ??= await deployHostedApp(root, project, runner, request, options.source);
  const site = {
    ...existing,
    ...identity,
    siteUrl,
    deploy: 'direct',
    ...(options.source
      ? { kitSource: options.source.kitSource, deployedKitRevision: options.source.revision }
      : {}),
  };
  await saveJson(path.join(root, '.album-site.json'), site);
  if (!options.source) {
    console.log(`Milestone: Site created. ${siteUrl}`);
    console.log(JSON.stringify({ siteUrl, project: name, deploy: 'direct' }));
  }
  return site;
}

function writeEnvKey(filePath, key, value) {
  const current = readText(filePath) ?? '';
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const next = pattern.test(current)
    ? current.replace(pattern, line)
    : `${current.trimEnd()}${current.length > 0 ? '\n' : ''}${line}\n`;
  writeFileSync(filePath, next.endsWith('\n') ? next : `${next}\n`, { mode: 0o600 });
}

function maskArg(args, index, arg, options) {
  return options.secretAfter !== undefined &&
    args[index - 1] === options.secretAfter &&
    !arg.startsWith('<')
    ? '<hidden>'
    : arg;
}

function quote(value) {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

function repoPath(url) {
  const match = /[/:]([^/:]+)\/([^/]+?)(?:\.git)?\/*$/.exec(url.trim());
  return match === null ? null : `${match[1]}/${match[2]}`.toLowerCase();
}

function parseJson(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await setup(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof ExitError) {
      console.error(error.message);
      process.exit(error.code);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(EXIT.failed);
  }
}
