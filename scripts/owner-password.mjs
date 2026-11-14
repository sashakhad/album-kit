#!/usr/bin/env node
// pnpm owner:password
// Reads a new owner password from stdin, writes .album-key, and replaces
// ALBUM_KEY on the linked Vercel project. The old password is not required.
// Exit 2 means the CLI is not signed in; the password file was still saved.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createRunner, EXIT, ExitError, rotateAlbumKey, usableOwnerPassword } from './setup.mjs';

export function applyOwnerPassword(password, runner = createRunner({ dryRun: false })) {
  const usable = usableOwnerPassword(password);
  if (usable === null) {
    throw new ExitError(
      EXIT.failed,
      'The owner password must be one line of 4 to 200 characters. Ask again with a secret card. Do not pass it as an argument or paste it into chat.'
    );
  }
  writeFileSync('.album-key', `${usable}\n`, { mode: 0o600 });
  const result = rotateAlbumKey(runner, usable);
  if (!result.cli) {
    console.log('Saved the owner password to .album-key.');
    console.log(
      'NEXT: Set Vercel env ALBUM_KEY from that file on production. Do not print the password. The old password is not required. Then redeploy.'
    );
    return EXIT.notSignedIn;
  }
  console.log(`Owner password updated for ${result.updated.join(', ')}.`);
  console.log(
    'NEXT: Redeploy so the live site uses it. The old password is not required. Do not print the password.'
  );
  return EXIT.ok;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(applyOwnerPassword(readFileSync(0, 'utf8')));
  } catch (error) {
    if (error instanceof ExitError) {
      console.error(error.message);
      process.exit(error.code);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(EXIT.failed);
  }
}
