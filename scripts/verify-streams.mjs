#!/usr/bin/env node
// pnpm takes:verify
// Checks every stored stream returns playable media. Prints one line and no URLs.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const connection = ownerConnection();
if (connection === null) {
  console.error('Need .album-site.json and .album-key. Run pnpm setup:site first.');
  process.exit(1);
}

const response = await fetch(`${connection.siteUrl}/api/owner/streams/verify`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${connection.key}` },
  signal: AbortSignal.timeout(300000),
});
const result = await response.json().catch(() => null);
if (!response.ok || typeof result?.line !== 'string') {
  console.error(
    typeof result?.error === 'string' ? result.error : `The album site returned ${response.status}.`
  );
  process.exit(1);
}
if (result.line.includes(connection.key)) {
  console.error('Refusing to print a stream check that contains the album key.');
  process.exit(1);
}
process.stdout.write(`${result.line}\n`);
const ok = typeof result.ok === 'number' ? result.ok : 0;
const total = typeof result.total === 'number' ? result.total : 0;
if (total > 0 && ok !== total) {
  process.exit(1);
}

function ownerConnection() {
  try {
    const site = JSON.parse(readFileSync(path.join(process.cwd(), '.album-site.json'), 'utf8'));
    const key = readFileSync(path.join(process.cwd(), '.album-key'), 'utf8').trim();
    return typeof site.siteUrl === 'string' && site.siteUrl.startsWith('https://') && key.length > 0
      ? { siteUrl: site.siteUrl.replace(/\/$/, ''), key }
      : null;
  } catch {
    return null;
  }
}
