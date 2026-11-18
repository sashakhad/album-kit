#!/usr/bin/env node
// pnpm takes:verify
// Checks every stored stream returns playable media. Prints one line and no URLs.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { readWriteToken } from './album-owner.mjs';

const connection = ownerConnection();
if (connection === null) {
  console.error('Need .album-site.json and ALBUM_WRITE_TOKEN in .env. Run pnpm setup:site first.');
  process.exit(1);
}

const { nextStreamCheck, streamCheckLine } = await import('../src/lib/album/verify-stream.ts');

let state = { attempt: 0, pending: null, ok: 0, waiting: 0, failed: 0, retried: false };
let done = false;
for (let turn = 0; turn < 40 && !done; turn += 1) {
  const response = await fetch(`${connection.siteUrl}/api/owner/streams/verify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ attempt: state.attempt, pending: state.pending }),
    signal: AbortSignal.timeout(70_000),
  });
  const pass = await response.json().catch(() => null);
  if (!response.ok || pass === null || typeof pass.ok !== 'number') {
    console.error(
      typeof pass?.error === 'string' ? pass.error : `The album site returned ${response.status}.`
    );
    process.exit(1);
  }
  const step = nextStreamCheck(state, pass);
  state = step.state;
  done = step.done;
  if (!done && step.sleepMs !== null && step.sleepMs > 0) {
    await new Promise(resolve => {
      setTimeout(resolve, step.sleepMs);
    });
  }
}
const line = streamCheckLine({
  ok: state.ok,
  waiting: state.waiting,
  failed: state.failed,
  retried: state.retried,
});
if (line.includes(connection.key)) {
  console.error('Refusing to print a stream check that contains the album key.');
  process.exit(1);
}
process.stdout.write(`${line}\n`);
const total = state.ok + state.waiting + state.failed;
if (total > 0 && state.ok !== total) {
  process.exit(1);
}

function ownerConnection() {
  try {
    const site = JSON.parse(readFileSync(path.join(process.cwd(), '.album-site.json'), 'utf8'));
    const key = readWriteToken();
    return typeof site.siteUrl === 'string' && site.siteUrl.startsWith('https://') && key !== null
      ? { siteUrl: site.siteUrl.replace(/\/$/, ''), key }
      : null;
  } catch {
    return null;
  }
}
