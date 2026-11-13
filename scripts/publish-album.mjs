#!/usr/bin/env node
// pnpm publish:album "<message>"
// Commits album/ and .album-site.json, then pushes or deploys the site.
// Exit codes: 0 done, 1 failed, 4 the Vercel account's email can't be read.
import { existsSync } from 'node:fs';

import {
  createRunner,
  deployAsAccountOwner,
  deployProduction,
  EXIT,
  ExitError,
  readAlbumSite,
} from './setup.mjs';

try {
  publish(process.argv.slice(2).join(' ').trim());
} catch (error) {
  if (error instanceof ExitError) {
    console.error(error.message);
    process.exit(error.code);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(EXIT.failed);
}

function publish(message) {
  if (message.length === 0) {
    throw new ExitError(EXIT.failed, 'Usage: pnpm publish:album "<message>"');
  }

  const runner = createRunner({ dryRun: false });
  const paths = ['album', '.album-site.json'].filter(item => existsSync(item));
  runner.must(runner.run('git', ['add', '--', ...paths]));
  const staged = runner.run('git', ['diff', '--cached', '--quiet', '--', ...paths]);
  if (staged.status === 1) {
    runner.must(runner.run('git', ['commit', '-m', `album: ${message}`, '--', ...paths]));
  } else if (staged.status === 0) {
    console.log('Nothing new in album/ to commit.');
  } else {
    runner.must(staged);
  }

  const site = readAlbumSite();
  if (site?.deploy !== 'git' && site?.deploy !== 'cli') {
    throw new ExitError(
      EXIT.failed,
      '.album-site.json is missing or has no deploy mode. Run pnpm setup:site first.'
    );
  }

  if (site.deploy === 'git') {
    push(runner);
  } else {
    deployAsAccountOwner(runner);
    const remotes = runner.must(runner.run('git', ['remote'])).stdout.split('\n');
    if (remotes.some(remote => remote.trim() === 'origin')) {
      push(runner);
    }
    console.log('Deploying to Vercel. This takes a minute or two.');
    deployProduction(runner);
  }

  console.log(typeof site.siteUrl === 'string' ? site.siteUrl : 'Published.');
}

function push(runner) {
  const result = runner.run('git', ['push']);
  if (result.status !== 0 && /no upstream branch/i.test(result.stderr)) {
    runner.must(runner.run('git', ['push', '--set-upstream', 'origin', 'HEAD']));
    return;
  }
  runner.must(result);
}
