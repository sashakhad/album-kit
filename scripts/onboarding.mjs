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

function probeGithubBackup(state, run, now) {
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
  return {
    signedIn: githubSignedIn || githubConnectorReady,
    account: githubConnectorReady ? connectorAccount : githubLogin,
    albumRemote: githubCliReady || githubConnectorReady,
    connectorVerified: githubConnectorReady,
  };
}

function recordedSite(root, state, now) {
  const site = parseJson(path.join(root, '.album-site.json'));
  const siteUrl =
    typeof site?.siteUrl === 'string' && /^https:\/\/[^\s/?#@]+\/?$/.test(site.siteUrl)
      ? site.siteUrl
      : null;
  return {
    siteUrl,
    connectorVerified: Boolean(
      siteUrl &&
      freshCheck(state.vercelConnector?.checkedAt, now) &&
      state.vercelConnector.siteUrl === siteUrl &&
      typeof site.project === 'string' &&
      state.vercelConnector.project === site.project
    ),
  };
}

export function probeReadiness(
  root,
  run = commandResult,
  now = Date.now(),
  { hosted = false, githubBackup = false } = {}
) {
  const state = parseJson(path.join(root, STATE_FILE)) ?? {};
  const needsPathChoice = !['light', 'full', 'quick', 'studio'].includes(state.path);
  const selectedPath = needsPathChoice ? 'light' : state.path;
  const album = parseJson(path.join(root, 'album', 'album.json'));
  const checkCursor = ['full', 'studio'].includes(selectedPath) && !hosted && !githubBackup;
  const cursorInstalled = checkCursor && run('cursor', ['--version']).ready;
  const suno = state.suno;
  const sunoFresh = freshCheck(suno?.checkedAt, now);
  const sunoCapabilitiesVerified = Boolean(
    sunoFresh &&
    (selectedPath !== 'full' || suno?.method === 'mcp') &&
    SUNO_REQUIRED_CAPABILITIES.every(capability => suno?.capabilities?.includes(capability)) &&
    (suno?.method === 'browser' || suno?.capabilities?.includes('credits'))
  );
  return {
    path: selectedPath,
    needsPathChoice,
    hostedOnly: hosted,
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
    ...(hosted ? { vercel: recordedSite(root, state, now) } : {}),
    ...(githubBackup ? { github: probeGithubBackup(state, run, now) } : {}),
  };
}

function nextGithubStep(status) {
  if (!status.github.signedIn) {
    return 'Connect GitHub, then verify the user-owned album repository and distinct origin and kit remotes.';
  }
  if (status.github.account === null) {
    return 'Verify the signed-in GitHub account through the connector or gh, then recheck the album remotes.';
  }
  if (!status.github.albumRemote) {
    return `Make origin a GitHub repository owned by ${status.github.account}, with kit pointing to a different GitHub repository.`;
  }
  return 'The album backup repository is verified.';
}

export function nextStep(status) {
  if (status.github) return nextGithubStep(status);
  if (status.hostedOnly) {
    if (!status.vercel.siteUrl) {
      return 'Deploy the album files directly to the creator’s Vercel project and connect its voting database. Save the public site URL.';
    }
    return 'Open /vote signed out, check that a take plays and the score buttons are available, then share the public link.';
  }
  if (status.needsPathChoice) {
    return 'Choose Album Bot Light for a quick local album or Full Setup to compare Cursor writers with paid Suno.';
  }
  if (!status.album) {
    return 'Collect the album name, genre, and track titles, then write album/album.json and album/BRIEF.md.';
  }
  if (status.path === 'light' || status.path === 'full') {
    if (status.path === 'light') {
      if (!status.suno.capabilitiesVerified) {
        return 'Check the signed-in Suno browser, or an existing paid connection, for create, status, and models. When Suno hides the balance, do not ask for it.';
      }
      return 'Generate the tracks and open the local preview to listen and score.';
    }
    if (!status.suno.capabilitiesVerified) {
      return 'Connect the paid Suno account and check its available models, generation tools, and credits.';
    }
    if (!status.cursor.modelExecutionVerified) {
      return 'Connect the Cursor project and verify which prompt writers it can run.';
    }
    return 'Choose up to five available Cursor writers. Compare each original prompt with the combined version, show the take count and Suno credit cost, and generate the tracks.';
  }
  if (!status.suno.capabilitiesVerified) {
    return 'Check the signed-in Suno connector or Free browser for create, status, and models; check credits when the account exposes them. Record only capabilities observed in the account.';
  }
  if (status.path === 'studio' && !status.cursor.modelExecutionVerified) {
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
  if (status.github) {
    console.log(`GitHub backup: ${status.github.albumRemote ? 'verified' : 'pending'}`);
    console.log(`Next: ${nextStep(status)}`);
    return;
  }
  if (status.hostedOnly) {
    console.log(
      status.vercel.siteUrl ? `Public site: ${status.vercel.siteUrl}` : 'Public site: pending'
    );
    if (status.vercel.connectorVerified)
      console.log('Vercel project verified through the connected account.');
    console.log(`Next: ${nextStep(status)}`);
    return;
  }
  const visible = [
    ['Album brief', status.album],
    ['Suno capabilities', status.suno.capabilitiesVerified],
  ];
  const usesCursor = status.path === 'studio' || status.path === 'full';
  if (usesCursor) visible.push(['Cursor execution', status.cursor.modelExecutionVerified]);
  const complete = visible.filter(([, ready]) => ready).length;
  const pathLabel = status.needsPathChoice
    ? 'Choose your setup'
    : status.path === 'light'
      ? 'Album Bot Light'
      : status.path === 'full'
        ? 'Full Setup'
        : status.path === 'studio'
          ? 'Studio'
          : 'Quick start';
  console.log(`Onboarding ${complete}/${visible.length} · ${pathLabel}`);
  if (usesCursor) {
    console.log(
      `Cursor: ${status.cursor.installed ? 'installed' : 'not detected'}; connected model execution ${status.cursor.modelExecutionVerified ? 'observed' : 'unverified'}`
    );
  }
  console.log(
    `Suno: ${status.suno.capabilitiesVerified ? `capabilities checked via ${status.suno.method}; download ${status.suno.downloadVerified ? 'verified' : 'unverified'}` : 'account/connector capabilities unverified or stale'}`
  );
  for (const [label, ready] of visible) console.log(`${ready ? '✓' : '○'} ${label}`);
  console.log(`Next: ${nextStep(status)}`);
}

export function main(argv = process.argv.slice(2), root = process.cwd(), run = commandResult) {
  const state = parseJson(path.join(root, STATE_FILE)) ?? {};
  const [action, ...args] = argv;
  const hostedStatus = action === 'status' && args.length === 1 && args[0] === '--hosted';
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
  } else if (action !== undefined && !hostedStatus && (action !== 'status' || args.length > 0)) {
    throw new Error(
      'Usage: pnpm onboarding [status [--hosted] | path quick|studio|light|full | verify-suno mcp create status models credits [download] | verify-suno browser create status models [credits] [download] | verify-github <account> <owner/repo> | verify-vercel <project> <site-url> | verify-cursor <observed-model> | confirm-owner-access]'
    );
  }
  const hosted = hostedStatus || action === 'verify-vercel' || action === 'confirm-owner-access';
  const status = probeReadiness(root, run, Date.now(), {
    hosted,
    githubBackup: action === 'verify-github',
  });
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
