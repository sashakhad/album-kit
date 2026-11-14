#!/usr/bin/env node
// pnpm publish:album "<message>"
// Commits album/ and .album-site.json, then pushes. Vercel builds the push.
// Exit codes: 0 done, 1 failed, 5 the album has no GitHub repo yet.
import { existsSync, writeFileSync } from 'node:fs';

import { createRunner, EXIT, ExitError, readAlbumSite } from './setup.mjs';

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

  const site = readAlbumSite();
  if (site === null || typeof site.project !== 'string') {
    throw new ExitError(
      EXIT.failed,
      '.album-site.json is missing or has no project. Run pnpm setup:site first.'
    );
  }
  if (site.deploy !== 'git') {
    site.deploy = 'git';
    writeFileSync('.album-site.json', `${JSON.stringify(site, null, 2)}\n`);
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

  const remotes = runner.must(runner.run('git', ['remote'])).stdout.split('\n');
  if (!remotes.some(remote => remote.trim() === 'origin')) {
    throw new ExitError(
      EXIT.noGitHub,
      'BLOCKER: This album has no origin. Create its GitHub repo and link the Vercel project with Git integration. Do not run vercel deploy and do not upload project files one by one.'
    );
  }

  console.log('Pushing. Vercel builds this push. Do not run vercel deploy.');
  const result = runner.run('git', ['push']);
  if (result.status !== 0 && /no upstream branch/i.test(result.stderr)) {
    runner.must(runner.run('git', ['push', '--set-upstream', 'origin', 'HEAD']));
  } else {
    runner.must(result);
  }
  console.log(typeof site.siteUrl === 'string' ? site.siteUrl : 'Published.');
}
