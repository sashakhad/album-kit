#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { deployHostedApp, hostedProject, saveJson } from './hosted-app.mjs';
import { createRunner, readAlbumSite } from './setup.mjs';

export async function publish(
  message,
  root = process.cwd(),
  runner = createRunner({ dryRun: false }),
  request = fetch
) {
  if (!message.trim()) throw new Error('Usage: pnpm publish:album "<message>"');
  const site = readAlbumSite(root);
  if (!site?.project)
    throw new Error('Run pnpm setup:site in this album folder before publishing.');
  const project = await hostedProject(
    root,
    { name: site.project, scope: site.scope, site, create: false },
    runner
  );
  const siteUrl = await deployHostedApp(root, project, runner, request);
  const { aliases: _aliases, ...identity } = project;
  await saveJson(path.join(root, '.album-site.json'), {
    ...site,
    ...identity,
    siteUrl,
    deploy: 'direct',
  });
  console.log(siteUrl);
  return siteUrl;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await publish(process.argv.slice(2).join(' '));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
