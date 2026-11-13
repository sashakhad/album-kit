#!/usr/bin/env node
// pnpm album:github
// Creates or confirms a private GitHub repo as origin. Exit 5 names the blocker.
import { createRunner, ensureGitHubRepo, EXIT, ExitError, readAlbumSite } from './setup.mjs';

try {
  const site = readAlbumSite();
  const project = site?.project;
  if (typeof project !== 'string' || project.length === 0) {
    throw new ExitError(
      EXIT.failed,
      '.album-site.json has no project name. Run pnpm setup:site first.'
    );
  }
  const github = ensureGitHubRepo(createRunner({ dryRun: false }), { project });
  if (!github.ok) {
    throw new ExitError(EXIT.noGitHub, `BLOCKER: ${github.blocker}`);
  }
} catch (error) {
  if (error instanceof ExitError) {
    console.error(error.message);
    process.exit(error.code);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(EXIT.failed);
}
