#!/usr/bin/env node
// pnpm setup:site [--name <project>] [--dry-run]
// Links this album to a Vercel project, provisions Blob, Neon and ALBUM_KEY,
// deploys, and prints {"siteUrl", "albumKey", "project"} as the last line.
// Exit codes: 0 done, 1 failed, 2 not signed in to Vercel, 3 the Neon step
// needs the browser, 4 the Vercel account's email can't be read.
import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERCEL_CLI = 'vercel@65.11.0';

export const EXIT = {
  ok: 0,
  failed: 1,
  notSignedIn: 2,
  neonNeedsBrowser: 3,
  noAccountEmail: 4,
};

const KEY_WORDS =
  `acorn amber anchor apple apron arrow aspen atlas attic autumn badge bagel bamboo banjo
barley basil beacon beetle berry bison blanket bonnet bramble brass breeze brick bridge brook bubble
bucket butter button cabin cactus candle canoe canyon carrot cashew castle cedar cello chalk cherry
chess cider cinder citrus clay clover cobalt cocoa comet copper coral cotton cradle crane crayon
creek cricket crystal cumin dahlia daisy denim desert dingo dolphin domino dragon drum dune eagle
ember emerald falcon fable feather fennel fern fiddle fig finch fjord flint flute forest fossil fox
frost garnet gecko ginger glacier globe gopher granite grape gravel guitar harbor hazel heron honey
hornet husky iris island ivory jade jasmine jelly juniper kayak kettle kiwi koala ladder lagoon
lantern lava lemon lilac linen lotus lunar maple marble meadow melon mesa mint mitten moss nectar
nickel nutmeg oak oasis ocean olive onyx orbit orchid otter owl paddle panda papaya parsley pebble
pecan pepper piano pickle pine plum pollen poppy prairie puffin quartz quill quince rabbit radish
raven reef ribbon river robin rocket saffron sage salmon satin sequoia shadow shell sierra silver
sparrow spruce squash stone sunny swan tango thistle thunder tiger timber topaz tulip tundra velvet
violet walnut willow`.split(/\s+/);

export class ExitError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createRunner({ dryRun }) {
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
    return run('npx', ['--yes', VERCEL_CLI, ...args], options);
  }

  function must(result) {
    if (result.status !== 0) {
      throw new ExitError(EXIT.failed, `Failed: ${result.shown}\n${result.stderr.trim()}`);
    }
    return result;
  }

  return { dryRun, run, vercel, must };
}

// Vercel's free plan blocks a deploy whose HEAD commit author isn't the account owner,
// and the CLI sends `git log -1`'s author with every deploy.
export function deployAsAccountOwner(runner, { checkSignIn = true } = {}) {
  const noEmail = new ExitError(
    EXIT.noAccountEmail,
    "Couldn't read the email of the signed-in Vercel account, and Vercel only deploys commits made by the account owner. Run: npx vercel login\nThen run this command again."
  );
  // Logged out, `vercel api` starts a device login and waits, so check the sign-in first.
  if (checkSignIn && runner.vercel(['whoami']).status !== 0) {
    throw noEmail;
  }
  const userResult = runner.vercel(['api', '/v2/user', '--raw'], { timeoutMs: 60_000 });
  if (runner.dryRun) {
    runner.run('git', ['log', '-1', '--format=%ae']);
    const when = 'if the last commit author is not the Vercel account email';
    runner.run('git', ['config', 'user.name', '<account name>'], { when });
    runner.run('git', ['config', 'user.email', '<account email>'], { when });
    runner.run('git', ['commit', '--allow-empty', '-m', 'album: deploy as <username>'], { when });
    return;
  }

  const user = parseJson(userResult.stdout)?.user;
  const email = typeof user?.email === 'string' ? user.email.trim() : '';
  if (userResult.status !== 0 || email.length === 0) {
    throw noEmail;
  }

  const insideRepo = runner.run('git', ['rev-parse', '--is-inside-work-tree']);
  const head = insideRepo.status === 0 ? runner.run('git', ['log', '-1', '--format=%ae']) : null;
  if (head === null || head.status !== 0) {
    return;
  }
  if (head.stdout.trim().toLowerCase() === email.toLowerCase()) {
    return;
  }

  const username =
    typeof user.username === 'string' && user.username.length > 0 ? user.username : email;
  const name = typeof user.name === 'string' && user.name.length > 0 ? user.name : username;
  runner.must(runner.run('git', ['config', 'user.name', name]));
  runner.must(runner.run('git', ['config', 'user.email', email]));
  runner.must(runner.run('git', ['commit', '--allow-empty', '-m', `album: deploy as ${username}`]));
}

// A project that `vercel link` creates gets connected to the folder's git remote, and on a fresh
// copy that remote is the public kit. Left connected, every push to the kit would redeploy this
// album's site from the kit's empty album.json.
export function disconnectKitRepo(runner, root = process.cwd()) {
  const kit = runner.run('git', ['remote', 'get-url', 'kit']);
  if (runner.dryRun) {
    runner.vercel(['api', '/v9/projects/<project id>', '--raw'], {
      when: 'if a kit remote exists',
    });
    runner.vercel(['git', 'disconnect', '--yes'], {
      when: 'if the project is connected to the kit remote',
    });
    return;
  }

  const kitRepo = kit.status === 0 ? repoPath(kit.stdout) : null;
  const projectId = parseJson(readText(path.join(root, '.vercel', 'project.json')))?.projectId;
  if (kitRepo === null || typeof projectId !== 'string') {
    return;
  }
  const project = runner.must(runner.vercel(['api', `/v9/projects/${projectId}`, '--raw']));
  const link = parseJson(project.stdout)?.link;
  const linkedRepo =
    typeof link?.org === 'string' && typeof link?.repo === 'string'
      ? `${link.org}/${link.repo}`.toLowerCase()
      : null;
  if (linkedRepo === kitRepo) {
    runner.must(runner.vercel(['git', 'disconnect', '--yes']));
  }
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

export function generateAlbumKey() {
  const words = [];
  while (words.length < 3) {
    const word = KEY_WORDS[randomInt(KEY_WORDS.length)];
    if (!words.includes(word)) {
      words.push(word);
    }
  }
  return `${words.join('-')}-${String(randomInt(100)).padStart(2, '0')}`;
}

// vercel env pull can't read a Secret back, and writes this placeholder in its place.
const SENSITIVE_PLACEHOLDER = '[SENSITIVE]';

export function usableAlbumKey(value) {
  const key = value?.trim() ?? '';
  return key.length > 0 && key !== SENSITIVE_PLACEHOLDER ? key : null;
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
  const options = { name: undefined, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--name') {
      options.name = argv[index + 1];
      index += 1;
      if (options.name === undefined || options.name.length === 0) {
        throw new ExitError(EXIT.failed, 'Usage: pnpm setup:site [--name <project>] [--dry-run]');
      }
    } else if (arg.startsWith('--name=')) {
      options.name = arg.slice('--name='.length);
    } else {
      throw new ExitError(
        EXIT.failed,
        `Unknown option ${arg}. Usage: pnpm setup:site [--name <project>] [--dry-run]`
      );
    }
  }
  return options;
}

function projectName(options, root) {
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

function productionUrl(runner, deploy) {
  const output = parseJson(deploy.stdout);
  const fromJson = output?.productionUrl ?? output?.deployment?.productionUrl;
  if (typeof fromJson === 'string' && fromJson.startsWith('https://')) {
    return fromJson;
  }

  const aliased = /Aliased:?\s+(https:\/\/\S+)/.exec(
    stripAnsi(`${deploy.stdout}\n${deploy.stderr}`)
  );
  if (aliased?.[1] !== undefined) {
    return aliased[1];
  }

  const deploymentUrl = output?.url ?? output?.deployment?.url;
  if (typeof deploymentUrl === 'string') {
    const inspect = runner.vercel(['inspect', deploymentUrl, '--json']);
    const aliases = parseJson(inspect.stdout)?.aliases;
    const domains = (Array.isArray(aliases) ? aliases : [])
      .map(alias => (typeof alias === 'string' ? alias : (alias?.alias ?? alias?.domain)))
      .filter(domain => typeof domain === 'string' && domain.length > 0)
      .sort((left, right) => left.length - right.length);
    if (domains[0] !== undefined) {
      return domains[0].startsWith('https://') ? domains[0] : `https://${domains[0]}`;
    }
  }

  throw new ExitError(
    EXIT.failed,
    `Failed: ${deploy.shown}\nThe deploy finished, but its production domain wasn't in the output. Check the project's Domains page on vercel.com.`
  );
}

function setup(options) {
  const root = process.cwd();
  const runner = createRunner({ dryRun: options.dryRun });
  if (options.dryRun) {
    console.log('Dry run. These are the commands pnpm setup:site runs, in order:');
  }

  const whoami = runner.vercel(['whoami']);
  if (!options.dryRun && whoami.status !== 0) {
    throw new ExitError(EXIT.notSignedIn, 'Not signed in to Vercel. Run: npx vercel login');
  }

  const name = projectName(options, root);
  const linked = existsSync(path.join(root, '.vercel', 'project.json'));
  if (options.dryRun || !linked) {
    runner.must(
      runner.vercel(['link', '--yes', '--project', name], {
        when: 'if .vercel/project.json is missing',
      })
    );
  }
  disconnectKitRepo(runner, root);

  const keys = options.dryRun ? new Set() : productionEnvKeys(runner);
  const kitHead = runner.run('git', ['rev-parse', '--verify', 'refs/remotes/kit/main']);
  const kitRevision =
    kitHead.status === 0 && /^[0-9a-f]{40}$/.test(kitHead.stdout.trim())
      ? kitHead.stdout.trim()
      : null;
  if (options.dryRun) {
    runner.vercel(['env', 'ls', 'production', '--json']);
  }

  if (!keys.has('BLOB_READ_WRITE_TOKEN') && !keys.has('BLOB_STORE_ID')) {
    runner.must(
      runner.vercel(['blob', 'create-store', `${name}-audio`, '--access', 'private', '--yes'], {
        when: 'if neither a Blob token nor store ID is configured',
      })
    );
    runner.must(
      runner.vercel(['env', 'add', 'BLOB_ACCESS', 'production', '--value', 'private', '--yes'], {
        when: 'only for a newly created private Blob store',
      })
    );
    runner.must(
      runner.vercel(
        ['env', 'add', 'PRIVATE_BLOB_AUDITED', 'production', '--value', 'true', '--yes'],
        {
          when: 'new projects have no earlier public take store',
        }
      )
    );
  }

  if (!keys.has('DATABASE_URL')) {
    const neon = runner.vercel(['integration', 'add', 'neon'], {
      when: 'if DATABASE_URL is missing',
    });
    if (!options.dryRun && (neon.status !== 0 || !productionEnvKeys(runner).has('DATABASE_URL'))) {
      const output = `${neon.stdout}${neon.stderr}`.trim();
      throw new ExitError(
        EXIT.neonNeedsBrowser,
        `${output.length > 0 ? `${output}\n` : ''}Finish the Neon step in the browser, then run pnpm setup:site again`
      );
    }
  }

  if (kitRevision !== null && !keys.has('ALBUM_KIT_REVISION')) {
    runner.must(
      runner.vercel([
        'env',
        'add',
        'ALBUM_KIT_REVISION',
        'production',
        '--value',
        kitRevision,
        '--yes',
      ])
    );
  }

  const keyFile = path.join(root, '.album-key');
  let albumKey = usableAlbumKey(readText(keyFile));
  if (!keys.has('ALBUM_KEY')) {
    const generated = options.dryRun ? '<new album key>' : generateAlbumKey();
    runner.must(
      runner.vercel(['env', 'add', 'ALBUM_KEY', 'production', '--value', generated, '--yes'], {
        when: 'if ALBUM_KEY is missing; also writes the key to .album-key',
        secretAfter: '--value',
      })
    );
    if (!options.dryRun) {
      writeFileSync(keyFile, `${generated}\n`);
      albumKey = generated;
    }
  }

  runner.must(runner.vercel(['env', 'pull', '.env.local', '--environment', 'production', '--yes']));
  if (!options.dryRun && albumKey === null) {
    albumKey = usableAlbumKey(readEnvFile(path.join(root, '.env.local')).ALBUM_KEY);
    if (albumKey === null) {
      console.log(
        "Vercel keeps ALBUM_KEY secret, so setup can't read it back. Ask the owner for the album key, then save it: printf '%s\\n' '<album key>' > .album-key"
      );
    } else {
      writeFileSync(keyFile, `${albumKey}\n`);
    }
  }

  deployAsAccountOwner(runner, { checkSignIn: false });
  const deploy = runner.must(runner.vercel(['deploy', '--prod', '--yes', '--json']));
  const siteUrl = options.dryRun ? null : productionUrl(runner, deploy);

  const existing = readAlbumSite(root);
  const site = {
    siteUrl,
    project: name,
    deploy: existing?.deploy === 'git' || existing?.deploy === 'cli' ? existing.deploy : 'cli',
    kitSource: 'https://github.com/sashakhad/album-kit',
    kitRevision: existing?.kitRevision ?? kitRevision,
  };
  if (!options.dryRun) {
    writeFileSync(path.join(root, '.album-site.json'), `${JSON.stringify(site, null, 2)}\n`);
  }

  if (typeof siteUrl === 'string' && siteUrl.startsWith('https://')) {
    console.log(`Milestone: Site created. ${siteUrl}`);
  }
  console.log(JSON.stringify({ siteUrl, albumKey, project: name }));
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

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
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
    setup(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof ExitError) {
      console.error(error.message);
      process.exit(error.code);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(EXIT.failed);
  }
}
