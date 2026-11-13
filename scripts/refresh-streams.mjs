#!/usr/bin/env node
// pnpm takes:refresh <clips.json>
// clips.json is [{ "id" }] or [{ "id", "audio_url" }].
// With no playable audio_url, the site reads the public Suno clip and stores its MP4.
// The site replaces missing or stale stream URLs for those clip ids.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (file === undefined) {
  console.error('Usage: pnpm takes:refresh <clips.json>');
  console.error(
    'clips.json is an array of { "id" } or { "id", "audio_url" }. A clip id with no playable audio_url is resolved from the public Suno clip.'
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
if (!Array.isArray(clips) || !clips.every(isClipRecord)) {
  console.error('clips.json must be an array of { "id" } or { "id", "audio_url" }.');
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
const problems = clipProblems(body);
for (const problem of problems) {
  console.error(`${problem.clipId}: ${problem.problem}`);
}
if (problems.length > 0) {
  process.exit(1);
}

function isClipRecord(clip) {
  if (clip === null || typeof clip !== 'object') {
    return false;
  }
  if (typeof clip.id !== 'string' || clip.id.length === 0) {
    return false;
  }
  return (
    clip.audio_url === undefined || clip.audio_url === null || typeof clip.audio_url === 'string'
  );
}

function clipProblems(body) {
  try {
    const payload = JSON.parse(body);
    if (!Array.isArray(payload.problems)) {
      return [];
    }
    const problems = [];
    for (const problem of payload.problems) {
      if (
        problem !== null &&
        typeof problem === 'object' &&
        typeof problem.clipId === 'string' &&
        typeof problem.problem === 'string'
      ) {
        problems.push({ clipId: problem.clipId, problem: problem.problem });
      }
    }
    return problems;
  } catch {
    return [];
  }
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
