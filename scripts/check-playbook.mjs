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

async function main() {
  const skillDirs = await listSkillDirs();
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
