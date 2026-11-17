import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {Record<string, string | undefined>} DatabaseEnv
 * @typedef {{ status: number | null }} SpawnResult
 * @typedef {(command: string, args: readonly string[]) => SpawnResult} Spawn
 */

// Same value prisma.config.ts assigns to datasource.url. Migrate requires it;
// generate does not. Album sites with a URL still run generate, migrate, build.

/** @param {DatabaseEnv} [env] @returns {string | undefined} */
export function migrateDatabaseUrl(env = process.env) {
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  return url ? url : undefined;
}

/** @param {DatabaseEnv} [env] */
export function shouldDeployMigrations(env = process.env) {
  return migrateDatabaseUrl(env) !== undefined;
}

const binDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  '.bin'
);

function defaultSpawn(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}` },
  });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
  }
  return { status: result.status ?? 1 };
}

/**
 * @param {DatabaseEnv} [env]
 * @param {Spawn} [spawn]
 * @returns {number}
 */
export function runVercelBuild(env = process.env, spawn = defaultSpawn) {
  const steps = [['prisma', ['generate']]];
  if (shouldDeployMigrations(env)) {
    steps.push(['prisma', ['migrate', 'deploy']]);
  } else {
    process.stdout.write('Skipping prisma migrate deploy because no database URL is set.\n');
  }
  steps.push(['next', ['build']]);

  for (const [command, args] of steps) {
    const { status } = spawn(command, args);
    if (status !== 0) {
      return status ?? 1;
    }
  }
  return 0;
}

function isCliEntry() {
  const entry = process.argv[1];
  if (entry === undefined || entry.length === 0) {
    return false;
  }
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isCliEntry()) {
  process.exit(runVercelBuild());
}
