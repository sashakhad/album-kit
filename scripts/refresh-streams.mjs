#!/usr/bin/env node
// pnpm takes:refresh <clips.json>
// clips.json is [{ "id", "audio_url" }, ...] from library-list or library-search.
// The site replaces missing or stale stream URLs for those clip ids.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (file === undefined) {
  console.error('Usage: pnpm takes:refresh <clips.json>');
  console.error(
    'clips.json is an array of { "id", "audio_url" } from library-list or library-search.'
  );
  process.exit(1);
}

const connection = ownerConnection();
if (connection === null) {
  console.error('Need .album-site.json and .album-key. Run pnpm setup:site first.');
  process.exit(1);
}

let clips;
try {
  clips = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`Couldn't read ${file}: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
if (!Array.isArray(clips)) {
  console.error('clips.json must be an array of { "id", "audio_url" }.');
  process.exit(1);
}

const response = await fetch(`${connection.siteUrl}/api/owner/streams/refresh`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${connection.key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ clips }),
});
const body = await response.text();
if (!response.ok) {
  console.error(body);
  process.exit(1);
}
console.log(body);

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
