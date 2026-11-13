#!/usr/bin/env node
// A local checkpoint for the bot's first-run handoffs. No credentials or codes are stored.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const STATE_FILE = '.album-onboarding.json';
const SUNO_REQUIRED_CAPABILITIES = ['create', 'status', 'models', 'credits'];
const SUNO_OPTIONAL_CAPABILITIES = ['download'];
const FRESH_MS = 30 * 60 * 1000;

function remoteIdentity(url) {
  const trimmed = url
    .trim()
    .replace(/\.git\/?$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
  return /github\.com[:/]([^/]+\/[^/]+)$/.exec(trimmed)?.[1] ?? trimmed;
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
  const origin = run('git', ['remote', 'get-url', 'origin']);
  const kit = run('git', ['remote', 'get-url', 'kit']);
  const suno = state.suno;
  const sunoFresh = freshCheck(suno?.checkedAt, now);
  const sunoCapabilitiesVerified = Boolean(
    sunoFresh &&
    SUNO_REQUIRED_CAPABILITIES.every(capability => suno?.capabilities?.includes(capability))
  );

  return {
    path: state.path === 'studio' ? 'studio' : 'quick',
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
        vercelSignedIn &&
        typeof project?.projectId === 'string' &&
        project.projectId.length > 0 &&
        typeof site?.siteUrl === 'string' &&
        site.siteUrl.startsWith('https://')
      ),
    },
    github: {
      signedIn: githubSignedIn,
      albumRemote: Boolean(
        origin.ready &&
        kit.ready &&
        origin.output &&
        remoteIdentity(origin.output) !== remoteIdentity(kit.output)
      ),
    },
    ownerAccessConfirmed: Boolean(
      state.ownerAccess?.confirmedAt &&
      typeof site?.siteUrl === 'string' &&
      state.ownerAccess.siteUrl === site.siteUrl
    ),
  };
}

export function nextStep(status) {
  if (!status.album) {
    return 'Collect the album name, genre, and track titles, then write album/album.json and album/BRIEF.md.';
  }
  if (!status.suno.capabilitiesVerified) {
    return 'Check the signed-in Suno connector for create, status, models, and credits. Check download for private review or final export. Hand sign-in or a code to the owner if needed; then record the observed capabilities.';
  }
  if (!status.github.signedIn || !status.github.albumRemote) {
    return 'Sign in to GitHub if needed and make a user-owned album repository with distinct origin and kit remotes.';
  }
  if (!status.vercel.cliSignedIn) {
    return 'Ask the owner to finish Vercel sign-in, then recheck vercel whoami.';
  }
  if (!status.vercel.siteProvisioned) {
    return 'Run pnpm setup:site in the album checkout; resume after any Neon browser handoff.';
  }
  if (!status.ownerAccessConfirmed) {
    return 'Create a single-use owner link to /settings and confirm the owner reached Settings.';
  }
  if (status.path === 'studio' && !status.cursor.modelExecutionVerified) {
    return 'Check Cursor installation and connected Project execution; record only an observed model, or use Quick start.';
  }
  return `Run the Suno preflight and request the explicit round allowance before any paid generation.${status.suno.downloadVerified ? '' : ' Verify download capability before private review or final export.'}`;
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
    ['GitHub remotes', status.github.signedIn && status.github.albumRemote],
    ['Vercel site record', status.vercel.siteProvisioned],
    ['Owner access', status.ownerAccessConfirmed],
    ...(status.path === 'studio'
      ? [['Cursor execution', status.cursor.modelExecutionVerified]]
      : []),
  ];
  const complete = steps.filter(([, ready]) => ready).length;
  console.log(
    `Onboarding ${complete}/${steps.length} · ${status.path === 'studio' ? 'Studio' : 'Quick start'}`
  );
  console.log(
    `Cursor: ${status.cursor.installed ? 'installed' : 'not detected'}; connected model execution ${status.cursor.modelExecutionVerified ? 'observed' : 'unverified'}`
  );
  console.log(
    `Suno: ${status.suno.capabilitiesVerified ? `capabilities checked via ${status.suno.method}; download ${status.suno.downloadVerified ? 'verified' : 'unverified'}` : 'account/connector capabilities unverified or stale'}`
  );
  console.log(
    `Vercel: CLI ${status.vercel.cliSignedIn ? 'signed in' : 'sign-in needed'}; site ${status.vercel.siteProvisioned ? 'saved locally (check live URL)' : 'not verified'}`
  );
  for (const [label, ready] of steps) console.log(`${ready ? '✓' : '○'} ${label}`);
  console.log(`Next: ${nextStep(status)}`);
}

export function main(argv = process.argv.slice(2), root = process.cwd(), run = commandResult) {
  const state = parseJson(path.join(root, STATE_FILE)) ?? {};
  const [action, ...args] = argv;
  if (action === 'path' && (args[0] === 'quick' || args[0] === 'studio') && args.length === 1) {
    state.path = args[0];
    saveState(root, state);
  } else if (action === 'verify-suno') {
    const [method, ...capabilities] = args;
    const allowed = [...SUNO_REQUIRED_CAPABILITIES, ...SUNO_OPTIONAL_CAPABILITIES];
    if (
      !['mcp', 'browser'].includes(method) ||
      !SUNO_REQUIRED_CAPABILITIES.every(capability => capabilities.includes(capability)) ||
      capabilities.some(capability => !allowed.includes(capability)) ||
      new Set(capabilities).size !== capabilities.length
    ) {
      throw new Error(
        `Usage: pnpm onboarding verify-suno mcp|browser ${SUNO_REQUIRED_CAPABILITIES.join(' ')} [download]`
      );
    }
    state.suno = { method, capabilities, checkedAt: new Date().toISOString() };
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
      'Usage: pnpm onboarding [status | path quick|studio | verify-suno mcp|browser create status models credits [download] | verify-cursor <observed-model> | confirm-owner-access]'
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
