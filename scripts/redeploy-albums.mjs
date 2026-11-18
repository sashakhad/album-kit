#!/usr/bin/env node
// Redeploy album sites after a kit merge by POSTing Vercel Deploy Hooks.
// A hook URL is created in that album's Vercel project. It is not a GitHub token
// and cannot push to a repository. An empty list skips without failing.
import { pathToFileURL } from 'node:url';

export function parseDeployHooks(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return [];
  const hooks = value
    .split(/[\s,]+/)
    .map(hook => hook.trim())
    .filter(hook => hook.length > 0);
  for (const hook of hooks) {
    let url;
    try {
      url = new URL(hook);
    } catch {
      throw new Error('Each album deploy hook must be an https://api.vercel.com deploy hook URL.');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hostname !== 'api.vercel.com' ||
      !url.pathname.startsWith('/v1/integrations/deploy/')
    ) {
      throw new Error('Each album deploy hook must be an https://api.vercel.com deploy hook URL.');
    }
  }
  return hooks;
}

export async function redeployAlbums(env, request = fetch) {
  const hooks = parseDeployHooks(env.ALBUM_DEPLOY_HOOKS);
  if (hooks.length === 0) {
    console.log(
      'No album deploy hooks are set. Skipping. A kit merge does not use a GitHub token.'
    );
    return { triggered: 0 };
  }
  for (const hook of hooks) {
    const response = await request(hook, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`A Vercel deploy hook returned ${response.status}.`);
    }
  }
  console.log(`Triggered ${hooks.length} Vercel deploy ${hooks.length === 1 ? 'hook' : 'hooks'}.`);
  return { triggered: hooks.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await redeployAlbums(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
