#!/usr/bin/env node
// pnpm album:github
// Creates a public GitHub backup or confirms the existing origin.
import {
  createRunner,
  ensureGitHubRepo,
  EXIT,
  ExitError,
  projectName,
  readAlbumSite,
} from './setup.mjs';

try {
  const project = readAlbumSite()?.project || projectName({}, process.cwd());
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
