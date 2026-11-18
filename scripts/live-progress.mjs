import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const generationEstimate =
  'A short paid clip is often playable in a couple of minutes. A Free song can run about 3–4 minutes, so the first take can take longer. I’ll send each one as soon as you can tap it.';

export const tapToListen = 'Your album page is ready. Tap to listen ↓';

export const firstOnesIn =
  'Cool, the first ones are in. Spinning up your album page now. Tap here to listen.';

export const nextTracksLine =
  'I’ll make the next tracks on the album. /more makes more takes of this song, and /pick chooses favorites.';

export const stillWorking =
  'Still working. Nothing new yet. I’ll send the page as soon as a take can play.';

export const takingLonger = 'This one’s taking longer than usual. Still on it.';

export const restAreIn = 'The rest of the takes are in. Tap the page to listen.';

export const pageUpdated = 'The page is updated. Tap to listen.';

const completionQuestion = 'Your album is ready. What’s next?';
const completionChoices = ['Share album', 'Add more tracks'];

function progressPath(root) {
  return path.join(root, '.tmp', 'live-progress.json');
}

export async function readLiveProgress(root) {
  try {
    const value = JSON.parse(await readFile(progressPath(root), 'utf8'));
    if (value && typeof value === 'object') return value;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return {};
}

async function writeLiveProgress(root, value) {
  const file = progressPath(root);
  await mkdir(path.dirname(file), { recursive: true });
  const pending = path.join(path.dirname(file), 'live-progress-pending.json');
  await writeFile(pending, JSON.stringify(value), { mode: 0o600 });
  await rename(pending, file);
  return value;
}

export function shareHeard(progress) {
  return (
    typeof progress?.heardAt === 'string' &&
    typeof progress?.pageDeliveredAt === 'string' &&
    progress.heardAt > progress.pageDeliveredAt
  );
}

export function trackProgressLine(number, letters) {
  const clean = [];
  for (const letter of letters) {
    if (typeof letter === 'string' && /^[A-Z]+$/.test(letter)) clean.push(letter);
  }
  if (!Number.isInteger(number) || number < 1 || clean.length === 0) {
    throw new Error('A track progress line needs a track number and take letters.');
  }
  let list = clean[0];
  if (clean.length === 2) list = `${clean[0]} and ${clean[1]}`;
  if (clean.length > 2) {
    const head = clean.slice(0, -1).join(', ');
    list = `${head}, and ${clean[clean.length - 1]}`;
  }
  const noun = clean.length === 1 ? 'take' : 'takes';
  const verb = clean.length === 1 ? 'is' : 'are';
  return `Track ${number}, ${noun} ${list} ${verb} in.`;
}

export function deliverySay({ first, pendingTracks, landedLabel }) {
  const lines = [tapToListen];
  if (first) lines.push(firstOnesIn);
  if (typeof landedLabel === 'string' && landedLabel.length > 0) lines.push(landedLabel);
  else if (!first) lines.push(pageUpdated);
  if (pendingTracks) lines.push(nextTracksLine);
  else if (!first) lines.push(restAreIn);
  return lines.join('\n');
}

function sayResult(say, extra = {}) {
  return { say, shareCard: false, ...extra };
}

export async function startGeneration(root) {
  const progress = await readLiveProgress(root);
  await writeLiveProgress(root, { ...progress, startedAt: new Date().toISOString() });
  return sayResult(generationEstimate);
}

export async function waitingLine(root) {
  const progress = await readLiveProgress(root);
  await writeLiveProgress(root, { ...progress, waitedAt: new Date().toISOString() });
  return sayResult(stillWorking);
}

export async function slowLine(root) {
  const progress = await readLiveProgress(root);
  await writeLiveProgress(root, { ...progress, slowAt: new Date().toISOString() });
  return sayResult(takingLonger);
}

export async function markPageDelivered(root) {
  const progress = await readLiveProgress(root);
  const pageDeliveredAt = new Date().toISOString();
  await writeLiveProgress(root, { ...progress, pageDeliveredAt });
  return pageDeliveredAt;
}

export async function hearPage(root) {
  const progress = await readLiveProgress(root);
  if (typeof progress.pageDeliveredAt !== 'string') {
    throw new Error('Send the album page before asking whether to share it.');
  }
  const heardAt = new Date().toISOString();
  await writeLiveProgress(root, { ...progress, heardAt });
  return { heardAt, shareCard: false };
}

export async function shareCard(root) {
  const progress = await readLiveProgress(root);
  if (!shareHeard(progress)) {
    return {
      shareCard: false,
      say: tapToListen,
      reason:
        'The share card waits for the owner’s next message after the album page. Do not show it with the file.',
    };
  }
  return {
    shareCard: true,
    say: completionQuestion,
    choices: [...completionChoices],
    allowCustom: true,
  };
}

function lettersOf(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Usage: node scripts/live-progress.mjs track --number <n> --takes A,B');
  }
  const letters = [];
  for (const part of value.split(',')) {
    const letter = part.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(letter)) {
      throw new Error('Usage: node scripts/live-progress.mjs track --number <n> --takes A,B');
    }
    letters.push(letter);
  }
  return letters;
}

async function run(root, command, args) {
  if (command === 'start') return startGeneration(root);
  if (command === 'waiting') return waitingLine(root);
  if (command === 'slow') return slowLine(root);
  if (command === 'heard') return hearPage(root);
  if (command === 'share') return shareCard(root);
  if (command === 'track') {
    const numberFlag = args.indexOf('--number');
    const takesFlag = args.indexOf('--takes');
    const number = Number(args[numberFlag + 1]);
    const takes = lettersOf(args[takesFlag + 1]);
    return sayResult(trackProgressLine(number, takes));
  }
  throw new Error('Usage: node scripts/live-progress.mjs <start|waiting|slow|track|heard|share>');
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [command, ...args] = process.argv.slice(2);
    console.log(JSON.stringify(await run(process.cwd(), command, args)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
