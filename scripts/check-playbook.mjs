import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = path.join(ROOT, '.cursor', 'skills');
const EXAMPLES_DIR = path.join(ROOT, 'examples');
const APP_DIR = path.join(ROOT, 'src', 'app');
const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const allowedScripts = new Set(['install', 'exec', ...Object.keys(packageJson.scripts)]);
const routes = (await listFiles(path.join(APP_DIR, 'api')))
  .filter(file => path.basename(file) === 'route.ts')
  .map(file => path.relative(APP_DIR, path.dirname(file)).split(path.sep));

const PNPM_SCRIPT = /(?:^\s*|`)pnpm\s+(?:run\s+)?([A-Za-z][\w:-]*)/g;
const API_PATH = /\/api\/[\w\-.~/<>[\]{}$]*/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const SUNO_CDN = /cdn1\.suno\.ai/gi;

const ONBOARDING_PHRASES = [
  {
    file: path.join(ROOT, 'grokbot', 'BOT.md'),
    phrases: [
      'question widget card',
      'begin onboarding automatically',
      'explicitly start a fresh album flow',
      'Never ask how review takes should play',
      'made public on Suno',
      'public MP4',
      'reviewTakes',
      'Do not go silent',
      'pnpm album:progress',
      'Milestone: Site created.',
      'Every setup and round message includes the site URL',
      'Submit every generation in the authorized round at once',
      'that track is already on the site',
      'Do not say takes are still generating',
      'pnpm takes:verify',
      'streams returned 200',
      'one or two tracks',
      'about 20 Suno credits per track',
      'npx vercel login',
      'custom-mode lyrics field',
      'Sasha never hosts Album Bot for anyone.',
      'pnpm share:album',
      'pnpm setup:site --name <album-slug> --scope',
      'node scripts/preview-album.mjs --streams-only',
      '/share',
      'Retried newly published files that returned 403.',
      'no-CLI path',
    ],
  },
  {
    file: path.join(ROOT, '.cursor', 'skills', 'start-here', 'SKILL.md'),
    phrases: [
      'question widget card',
      'begin onboarding automatically',
      'explicitly begin a fresh album flow',
      'Never ask how review takes should play',
      'made public on Suno',
      'public MP4',
      'reviewTakes',
      'Milestone: Site created.',
      'Do not go silent',
      'Every setup and round message includes the site URL',
      'one or two tracks',
      'about 20 Suno credits per track',
      'npx vercel login',
      'No-CLI path',
      'original lyrics',
      'Sasha never hosts Album Bot for anyone.',
      'pnpm share:album',
      'pnpm setup:site --name <album-slug> --scope',
      'node scripts/preview-album.mjs --streams-only',
      '/share',
    ],
  },
  {
    file: path.join(ROOT, 'README.md'),
    phrases: [
      'Never ask how review takes should play',
      'made public on Suno',
      'public MP4',
      'one or two tracks',
      'about 20 Suno credits per track',
      'Sasha never hosts Album Bot for anyone.',
      'pnpm share:album',
      'pnpm setup:site --name <album-slug> --scope',
      'node scripts/preview-album.mjs --streams-only',
      '/share',
    ],
  },
  {
    file: path.join(ROOT, '.cursor', 'skills', 'suno-run', 'SKILL.md'),
    phrases: [
      'reviewTakes',
      'downloadsPerTake',
      'Never ask how review takes should play',
      'visibility: public',
      '.mp4',
      'pnpm album:progress',
      'Do not go silent',
      'Every setup and round message includes the site URL',
      'Submit every generation in the authorized round at once',
      'that track is already on the site',
      'Do not say takes are still generating',
      'pnpm takes:verify',
      'streams returned 200',
      'costModel',
      'downloadsPerOutput',
      'hostingEligibilityVerified',
      'about 20 Suno generation credits per track',
      'backfill',
      'node scripts/preview-album.mjs --streams-only',
      'Sasha never hosts Album Bot for anyone.',
      'custom mode',
      'Retried newly published files that returned 403.',
      'vercel integration add neon',
    ],
  },
];

const PLAYBOOK_SKILLS = [
  'start-here',
  'album-track',
  'song-prompts',
  'suno-run',
  'judge',
  'finish',
  'publish',
];

const problems = [];

function report(file, lineNumber, message) {
  problems.push(`${path.relative(ROOT, file)}:${lineNumber}: ${message}`);
}

async function listFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

async function listSkillDirs() {
  let entries;
  try {
    entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const dirs = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      dirs.push(path.join(SKILLS_DIR, entry.name));
    }
  }
  return dirs.sort();
}

function readFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (match === null) {
    return null;
  }

  const fields = new Map();
  let currentKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
    if (field !== null) {
      currentKey = field[1];
      fields.set(currentKey, field[2].trim());
      continue;
    }
    if (currentKey !== null && /^\s+\S/.test(line)) {
      fields.set(currentKey, `${fields.get(currentKey)} ${line.trim()}`.trim());
    }
  }
  return fields;
}

function trimRoute(raw) {
  return raw.replace(/[.,:;!?)\]}>'"`*]+$/, '').replace(/\/+$/, '');
}

function isAllowedRoute(route) {
  const parts = route.slice(1).split('/');
  return routes.some(
    template =>
      parts.length <= template.length &&
      parts.every((part, index) => template[index] === part || /^\[.+\]$/.test(template[index]))
  );
}

function checkFrontmatter(file, text) {
  const fields = readFrontmatter(text);
  if (fields === null) {
    report(file, 1, 'SKILL.md has no frontmatter');
    return;
  }
  for (const key of ['name', 'description']) {
    const value = fields.get(key);
    if (value === undefined || value.length === 0) {
      report(file, 1, `frontmatter is missing ${key}`);
    }
  }
}

function checkCommandsAndRoutes(file, lines) {
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(PNPM_SCRIPT)) {
      const script = match[1].replace(/[:-]+$/, '');
      if (!allowedScripts.has(script)) {
        report(file, index + 1, `names pnpm ${script}, which is not a playbook script`);
      }
    }
    const withoutAbsoluteUrls = line.replace(/https?:\/\/\S+/g, '');
    for (const match of withoutAbsoluteUrls.matchAll(API_PATH)) {
      const route = trimRoute(match[0]);
      if (!isAllowedRoute(route)) {
        report(file, index + 1, `names ${route}, which is not an album API route`);
      }
    }
  }
}

function checkForLeaks(file, lines) {
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(SUNO_CDN)) {
      report(file, index + 1, `contains ${match[0]}`);
    }
    for (const match of line.matchAll(UUID)) {
      report(file, index + 1, `contains a UUID (${match[0]})`);
    }
  }
}

async function checkSkillNames(skillDirs) {
  const names = new Set(skillDirs.map(dir => path.basename(dir)));
  for (const name of PLAYBOOK_SKILLS) {
    if (!names.has(name)) {
      problems.push(`missing skill ${name}`);
    }
  }
  for (const file of [path.join(ROOT, 'grokbot', 'BOT.md'), path.join(ROOT, 'README.md')]) {
    const text = await readFile(file, 'utf8');
    if (text.includes('album-making')) {
      report(file, 1, 'names album-making, which is not a skill');
    }
    for (const name of PLAYBOOK_SKILLS) {
      if (!text.includes(name)) {
        report(file, 1, `does not name the ${name} skill`);
      }
    }
  }

  const prompts = path.join(ROOT, '.cursor', 'skills', 'song-prompts', 'SKILL.md');
  const promptText = await readFile(prompts, 'utf8');
  if (promptText.includes('GOR-41')) {
    report(prompts, 1, 'still mentions GOR-41');
  }
  if (!promptText.includes('original lyrics') || !promptText.includes('custom mode')) {
    report(prompts, 1, 'lyrics guidance is missing');
  }
}

const FRESH_OPENING_FILES = [
  path.join(ROOT, 'grokbot', 'BOT.md'),
  path.join(ROOT, 'grokbot', 'PORTABLE.md'),
  path.join(ROOT, '.cursor', 'skills', 'start-here', 'SKILL.md'),
];

const FRESH_OPENING_PHRASES = [
  'Invent three album concepts',
  'theme, a sound, and a mood',
  'differ in style and in era',
  'not a genre name',
  'Surprise me',
  'What do you want to call this album?',
  'Keep these',
  "I'll name them myself",
  'Let Album Bot decide',
  'before any prompt or Suno generation',
  'Skip a step they already answered',
];

const STALE_OPENING_OPTIONS = [
  'Rain on the windows',
  'Windows down, loud pop',
  'A tiny haunted dance party',
];

async function checkFreshOpenings() {
  for (const file of FRESH_OPENING_FILES) {
    const text = await readFile(file, 'utf8');
    for (const phrase of FRESH_OPENING_PHRASES) {
      if (!text.includes(phrase)) {
        report(file, 1, `opening ideas are missing “${phrase}”`);
      }
    }
  }

  const bot = await readFile(path.join(ROOT, 'grokbot', 'BOT.md'), 'utf8');
  const start = await readFile(
    path.join(ROOT, '.cursor', 'skills', 'start-here', 'SKILL.md'),
    'utf8'
  );
  for (const [file, text] of [
    [path.join(ROOT, 'grokbot', 'BOT.md'), bot],
    [path.join(ROOT, '.cursor', 'skills', 'start-here', 'SKILL.md'), start],
  ]) {
    if (!text.includes('allowCustom: true')) {
      report(file, 1, 'opening ideas are missing “allowCustom: true”');
    }
  }

  const playbookFiles = [
    ...(await listFiles(SKILLS_DIR)),
    path.join(ROOT, 'grokbot', 'BOT.md'),
    path.join(ROOT, 'grokbot', 'PORTABLE.md'),
    path.join(ROOT, 'README.md'),
  ];
  for (const file of playbookFiles) {
    const text = await readFile(file, 'utf8');
    for (const stale of STALE_OPENING_OPTIONS) {
      if (text.includes(stale)) {
        report(file, 1, `opening still offers the fixed idea “${stale}”`);
      }
    }
  }
}

async function checkOnboardingCopy() {
  for (const entry of ONBOARDING_PHRASES) {
    let text;
    try {
      text = await readFile(entry.file, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      report(entry.file, 1, 'missing onboarding file');
      continue;
    }
    for (const phrase of entry.phrases) {
      if (!text.includes(phrase)) {
        report(entry.file, 1, `onboarding is missing “${phrase}”`);
      }
    }
  }
}

async function main() {
  await checkOnboardingCopy();
  await checkFreshOpenings();
  const skillDirs = await listSkillDirs();
  await checkSkillNames(skillDirs);
  if (skillDirs.length === 0) {
    problems.push(`${path.relative(ROOT, SKILLS_DIR)}: no skills found`);
  }

  for (const dir of skillDirs) {
    const skillFile = path.join(dir, 'SKILL.md');
    let text;
    try {
      text = await readFile(skillFile, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      report(skillFile, 1, 'skill folder has no SKILL.md');
      continue;
    }
    checkFrontmatter(skillFile, text);
  }

  const playbookFiles = [...(await listFiles(SKILLS_DIR)), path.join(ROOT, 'grokbot', 'BOT.md')];
  for (const file of playbookFiles) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
    checkCommandsAndRoutes(file, lines);
    checkForLeaks(file, lines);
  }

  const exampleFiles = await listFiles(EXAMPLES_DIR);
  for (const file of exampleFiles) {
    checkForLeaks(file, (await readFile(file, 'utf8')).split(/\r?\n/));
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    console.error(`check-playbook: ${problems.length} problem(s)`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `check-playbook: ok (${skillDirs.length} skills, ${exampleFiles.length} example files)\n`
  );
}

await main();
