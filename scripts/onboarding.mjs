#!/usr/bin/env node
// A local checkpoint for the bot's first-run handoffs. No credentials or codes are stored.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const STATE_FILE = '.album-onboarding.json';
const SUNO_REQUIRED_CAPABILITIES = ['create', 'status', 'models'];
const SUNO_OPTIONAL_CAPABILITIES = ['download'];
const FRESH_MS = 30 * 60 * 1000;

function githubRemoteIdentity(url) {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-z0-9-]+)\/([a-z0-9._-]+?)(?:\.git)?\/?$/i.exec(
      url.trim()
    );
  return match === null ? null : `${match[1]}/${match[2]}`.toLowerCase();
}

function freshCheck(checkedAt, now) {
  if (typeof checkedAt !== 'string') return false;
  const age = now - Date.parse(checkedAt);
  return age >= 0 && age <= FRESH_MS;
}

function parseJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function commandResult(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ready: result.error === undefined && result.status === 0,
    output: result.stdout?.trim() ?? '',
  };
}

export function probeReadiness(root, run = commandResult, now = Date.now()) {
  const album = parseJson(path.join(root, 'album', 'album.json'));
  const site = parseJson(path.join(root, '.album-site.json'));
  const project = parseJson(path.join(root, '.vercel', 'project.json'));
  const state = parseJson(path.join(root, STATE_FILE)) ?? {};
  const cursorInstalled = run('cursor', ['--version']).ready;
  const vercelSignedIn = run('vercel', ['whoami']).ready;
  const githubSignedIn = run('gh', ['auth', 'status']).ready;
  const githubAccount = githubSignedIn
    ? run('gh', ['api', 'user', '--hostname', 'github.com', '--jq', '.login'])
    : null;
  const githubLogin =
    githubAccount?.ready && /^[a-z0-9-]+$/i.test(githubAccount.output)
      ? githubAccount.output.toLowerCase()
      : null;
  const origin = run('git', ['remote', 'get-url', 'origin']);
  const kit = run('git', ['remote', 'get-url', 'kit']);
  const originIdentity = origin.ready ? githubRemoteIdentity(origin.output) : null;
  const kitIdentity = kit.ready ? githubRemoteIdentity(kit.output) : null;
  const originIsDistinct = Boolean(originIdentity && kitIdentity && originIdentity !== kitIdentity);
  const originOwnedByAccount = Boolean(
    githubLogin && originIsDistinct && originIdentity.split('/')[0] === githubLogin
  );
  const originRepo = originOwnedByAccount
    ? run('gh', [
        'api',
        `repos/${originIdentity}`,
        '--hostname',
        'github.com',
        '--jq',
        '.full_name',
      ])
    : null;
  const suno = state.suno;
  const sunoFresh = freshCheck(suno?.checkedAt, now);
  const sunoCapabilitiesVerified = Boolean(
    sunoFresh &&
    SUNO_REQUIRED_CAPABILITIES.every(capability => suno?.capabilities?.includes(capability)) &&
    (suno?.method === 'browser' || suno?.capabilities?.includes('credits'))
  );
  // Connector checks are recorded only after a live connector operation. A CLI login
  // is not required when the connector verified the same account and resource.
  const connectorAccount = state.githubConnector?.account?.toLowerCase();
  const connectorRepo = state.githubConnector?.repo?.toLowerCase();
  const githubConnectorReady = Boolean(
    freshCheck(state.githubConnector?.checkedAt, now) &&
    originIsDistinct &&
    connectorRepo === originIdentity &&
    connectorAccount === originIdentity.split('/')[0]
  );
  const githubCliReady = Boolean(
    originOwnedByAccount && originRepo?.ready && originRepo.output.toLowerCase() === originIdentity
  );
  const siteRecorded = Boolean(
    typeof site?.siteUrl === 'string' && site.siteUrl.startsWith('https://')
  );
  const vercelConnectorReady = Boolean(
    freshCheck(state.vercelConnector?.checkedAt, now) &&
    siteRecorded &&
    state.vercelConnector?.siteUrl === site.siteUrl &&
    typeof site?.project === 'string' &&
    state.vercelConnector?.project === site.project
  );

  return {
    path:
      state.path === 'studio' || state.path === 'light' || state.path === 'full'
        ? state.path
        : 'quick',
    album: Boolean(
      typeof album?.title === 'string' &&
      album.title.trim() &&
      album.title !== 'Untitled album' &&
      typeof album.genre === 'string' &&
      album.genre.trim() &&
      Array.isArray(album.tracks) &&
      album.tracks.length > 0 &&
      existsSync(path.join(root, 'album', 'BRIEF.md'))
    ),
    cursor: {
      installed: cursorInstalled,
      modelExecutionVerified: Boolean(
        cursorInstalled &&
        typeof state.cursor?.observedModel === 'string' &&
        state.cursor.observedModel.trim() &&
        freshCheck(state.cursor?.checkedAt, now)
      ),
    },
    suno: {
      method: suno?.method === 'mcp' || suno?.method === 'browser' ? suno.method : null,
      capabilitiesVerified: sunoCapabilitiesVerified,
      downloadVerified: Boolean(
        sunoCapabilitiesVerified && suno?.capabilities?.includes('download')
      ),
      checkedAt: typeof suno?.checkedAt === 'string' ? suno.checkedAt : null,
    },
    vercel: {
      cliSignedIn: vercelSignedIn,
      siteProvisioned: Boolean(
        vercelConnectorReady ||
        (vercelSignedIn &&
          typeof project?.projectId === 'string' &&
          project.projectId.length > 0 &&
          siteRecorded)
      ),
      connectorVerified: vercelConnectorReady,
    },
    github: {
      signedIn: githubSignedIn || githubConnectorReady,
      account: githubConnectorReady ? connectorAccount : githubLogin,
      albumRemote: githubCliReady || githubConnectorReady,
      connectorVerified: githubConnectorReady,
    },
    ownerAccessConfirmed: Boolean(
      state.ownerAccess?.confirmedAt &&
      typeof site?.siteUrl === 'string' &&
      state.ownerAccess.siteUrl === site.siteUrl
    ),
  };
}

export function nextStep(status) {
  if (status.path === 'light') {
    if (!status.album) {
      return 'Collect the album name, genre, and track titles, then write album/album.json and album/BRIEF.md.';
    }
    if (!status.suno.capabilitiesVerified) {
      return 'Check the signed-in Suno browser, or an existing paid connection, for create, status, and models. When Suno hides the balance, do not ask for it.';
    }
    return 'Open the local preview. Scores and the pass stay on this computer. Do not connect GitHub, Vercel, or Cursor.';
  }
  if (!status.album) {
    return 'Collect the album name, genre, and track titles, then write album/album.json and album/BRIEF.md.';
  }
  if (!status.suno.capabilitiesVerified) {
    return 'Check the signed-in Suno connector or Free browser for create, status, and models; check credits when the account exposes them. Record only capabilities observed in the account.';
  }
  if (!status.github.signedIn) {
    return 'Connect GitHub, then verify the user-owned album repository and distinct origin and kit remotes.';
  }
  if (status.github.account === null) {
    return 'Verify the signed-in GitHub account through the connector or gh, then recheck the album remotes.';
  }
  if (!status.github.albumRemote) {
    return `Make origin a GitHub repository owned by ${status.github.account}, with kit pointing to a different GitHub repository.`;
  }
  if (!status.vercel.siteProvisioned) {
    return 'Verify the Vercel project through the connector or CLI, then finish site setup and any Neon handoff.';
  }
  if (!status.ownerAccessConfirmed) {
    return 'Open the one-time owner link, confirm Compare takes opens, and check that the site plays. Then run pnpm onboarding confirm-owner-access.';
  }
  if (
    (status.path === 'studio' || status.path === 'full') &&
    !status.cursor.modelExecutionVerified
  ) {
    return 'Check Cursor installation and connected Project execution; record only an observed model, or use Album Bot Light.';
  }
  return `Run the Suno preflight before generation and ask about cost only when the cost threshold requires it.${status.suno.downloadVerified ? '' : ' Verify download capability before final export.'}`;
}

function saveState(root, state) {
  writeFileSync(path.join(root, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
}

function printStatus(status) {
  const steps = [
    ['Album brief', status.album],
    ['Suno capabilities', status.suno.capabilitiesVerified],
    ['GitHub remotes', status.github.albumRemote],
    ['Vercel site record', status.vercel.siteProvisioned],
    ['Owner access', status.ownerAccessConfirmed],
    ...(status.path === 'studio' || status.path === 'full'
      ? [['Cursor execution', status.cursor.modelExecutionVerified]]
      : []),
  ];
  const visible =
    status.path === 'light'
      ? [
          ['Album brief', status.album],
          ['Suno capabilities', status.suno.capabilitiesVerified],
        ]
      : steps;
  const complete = visible.filter(([, ready]) => ready).length;
  const pathLabel =
    status.path === 'light'
      ? 'Album Bot Light'
      : status.path === 'full'
        ? 'Full Setup'
        : status.path === 'studio'
          ? 'Studio'
          : 'Quick start';
  console.log(`Onboarding ${complete}/${visible.length} · ${pathLabel}`);
  console.log(
    `Cursor: ${status.cursor.installed ? 'installed' : 'not detected'}; connected model execution ${status.cursor.modelExecutionVerified ? 'observed' : 'unverified'}`
  );
  console.log(
    `Suno: ${status.suno.capabilitiesVerified ? `capabilities checked via ${status.suno.method}; download ${status.suno.downloadVerified ? 'verified' : 'unverified'}` : 'account/connector capabilities unverified or stale'}`
  );
  console.log(
    `GitHub: ${status.github.connectorVerified ? 'connector verified' : status.github.signedIn ? 'CLI signed in' : 'not verified'}; album remote ${status.github.albumRemote ? 'verified' : 'pending'}`
  );
  console.log(
    `Vercel: ${status.vercel.connectorVerified ? 'connector verified' : status.vercel.cliSignedIn ? 'CLI signed in' : 'not verified'}; site ${status.vercel.siteProvisioned ? 'saved locally (check live URL)' : 'not verified'}`
  );
  for (const [label, ready] of visible) console.log(`${ready ? '✓' : '○'} ${label}`);
  console.log(`Next: ${nextStep(status)}`);
}

export function main(argv = process.argv.slice(2), root = process.cwd(), run = commandResult) {
  const state = parseJson(path.join(root, STATE_FILE)) ?? {};
  const [action, ...args] = argv;
  if (
    action === 'path' &&
    (args[0] === 'quick' || args[0] === 'studio' || args[0] === 'light' || args[0] === 'full') &&
    args.length === 1
  ) {
    state.path = args[0];
    saveState(root, state);
  } else if (action === 'verify-suno') {
    const [method, ...capabilities] = args;
    const allowed = [...SUNO_REQUIRED_CAPABILITIES, 'credits', ...SUNO_OPTIONAL_CAPABILITIES];
    if (
      !['mcp', 'browser'].includes(method) ||
      !SUNO_REQUIRED_CAPABILITIES.every(capability => capabilities.includes(capability)) ||
      (method === 'mcp' && !capabilities.includes('credits')) ||
      capabilities.some(capability => !allowed.includes(capability)) ||
      new Set(capabilities).size !== capabilities.length
    ) {
      throw new Error(
        `Usage: pnpm onboarding verify-suno mcp ${SUNO_REQUIRED_CAPABILITIES.join(' ')} credits [download] | browser ${SUNO_REQUIRED_CAPABILITIES.join(' ')} [credits] [download]`
      );
    }
    state.suno = { method, capabilities, checkedAt: new Date().toISOString() };
    saveState(root, state);
  } else if (action === 'verify-github' && args.length === 2) {
    const [account, repo] = args;
    if (
      !/^[a-z0-9-]+$/i.test(account) ||
      githubRemoteIdentity(`https://github.com/${repo}`) !== repo.toLowerCase() ||
      repo.split('/')[0].toLowerCase() !== account.toLowerCase()
    ) {
      throw new Error(
        'Usage: pnpm onboarding verify-github <observed-account> <observed-owner/repo>'
      );
    }
    state.githubConnector = { account, repo, checkedAt: new Date().toISOString() };
    saveState(root, state);
  } else if (action === 'verify-vercel' && args.length === 2) {
    const [project, siteUrl] = args;
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(project) || !/^https:\/\/[^\s/]+(?:\/)?$/.test(siteUrl)) {
      throw new Error(
        'Usage: pnpm onboarding verify-vercel <observed-project> <observed-https-site-url>'
      );
    }
    state.vercelConnector = { project, siteUrl, checkedAt: new Date().toISOString() };
    saveState(root, state);
  } else if (action === 'verify-cursor' && args.length === 1 && args[0].trim()) {
    state.cursor = { observedModel: args[0], checkedAt: new Date().toISOString() };
    saveState(root, state);
  } else if (action === 'confirm-owner-access' && args.length === 0) {
    const siteUrl = parseJson(path.join(root, '.album-site.json'))?.siteUrl;
    if (typeof siteUrl !== 'string' || !siteUrl.startsWith('https://')) {
      throw new Error('A provisioned site URL is required before owner access can be confirmed.');
    }
    state.ownerAccess = { confirmedAt: new Date().toISOString(), siteUrl };
    saveState(root, state);
  } else if (action !== undefined && (action !== 'status' || args.length > 0)) {
    throw new Error(
      'Usage: pnpm onboarding [status | path quick|studio|light|full | verify-suno mcp create status models credits [download] | verify-suno browser create status models [credits] [download] | verify-github <account> <owner/repo> | verify-vercel <project> <site-url> | verify-cursor <observed-model> | confirm-owner-access]'
    );
  }
  const status = probeReadiness(root, run);
  printStatus(status);
  return status;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
