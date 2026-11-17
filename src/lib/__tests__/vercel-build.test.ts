// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runVercelBuild, shouldDeployMigrations } from '../../../scripts/vercel-build.mjs';

type SpawnResult = { status: number | null };
type Spawn = (command: string, args: readonly string[]) => SpawnResult;

function okStatus(_shown: string): number {
  return 0;
}

function recordingSpawn(calls: string[], statusFor: (shown: string) => number = okStatus): Spawn {
  function spawn(command: string, args: readonly string[]): SpawnResult {
    const shown = [command, ...args].join(' ');
    calls.push(shown);
    return { status: statusFor(shown) };
  }
  return spawn;
}

describe('vercel build migrations', () => {
  it('skips migrate deploy when neither database URL is set', () => {
    const calls: string[] = [];
    const status = runVercelBuild({}, recordingSpawn(calls));

    expect(status).toBe(0);
    expect(shouldDeployMigrations({})).toBe(false);
    expect(calls).toEqual(['prisma generate', 'next build']);
  });

  it('skips migrate deploy when both URLs are empty', () => {
    const calls: string[] = [];
    const status = runVercelBuild(
      { DATABASE_URL: '', DATABASE_URL_UNPOOLED: '' },
      recordingSpawn(calls)
    );

    expect(status).toBe(0);
    expect(calls).toEqual(['prisma generate', 'next build']);
  });

  it('runs migrate deploy when DATABASE_URL is set', () => {
    const calls: string[] = [];
    const status = runVercelBuild({ DATABASE_URL: 'postgresql://album/db' }, recordingSpawn(calls));

    expect(status).toBe(0);
    expect(shouldDeployMigrations({ DATABASE_URL: 'postgresql://album/db' })).toBe(true);
    expect(calls).toEqual(['prisma generate', 'prisma migrate deploy', 'next build']);
  });

  it('runs migrate deploy when only the unpooled URL is set', () => {
    const calls: string[] = [];
    const status = runVercelBuild(
      { DATABASE_URL_UNPOOLED: 'postgresql://album/direct' },
      recordingSpawn(calls)
    );

    expect(status).toBe(0);
    expect(calls).toEqual(['prisma generate', 'prisma migrate deploy', 'next build']);
  });

  it('prefers the unpooled URL and still migrates once when both are set', () => {
    const calls: string[] = [];
    const env = {
      DATABASE_URL: 'postgresql://album/pool',
      DATABASE_URL_UNPOOLED: 'postgresql://album/direct',
    };
    const status = runVercelBuild(env, recordingSpawn(calls));

    expect(status).toBe(0);
    expect(calls).toEqual(['prisma generate', 'prisma migrate deploy', 'next build']);
  });

  it('stops before migrate and build when generate fails', () => {
    const calls: string[] = [];
    function statusFor(shown: string): number {
      return shown === 'prisma generate' ? 2 : 0;
    }
    const status = runVercelBuild(
      { DATABASE_URL: 'postgresql://album/db' },
      recordingSpawn(calls, statusFor)
    );

    expect(status).toBe(2);
    expect(calls).toEqual(['prisma generate']);
  });

  it('stops before the build when migrate deploy fails', () => {
    const calls: string[] = [];
    function statusFor(shown: string): number {
      return shown === 'prisma migrate deploy' ? 1 : 0;
    }
    const status = runVercelBuild(
      { DATABASE_URL: 'postgresql://album/db' },
      recordingSpawn(calls, statusFor)
    );

    expect(status).toBe(1);
    expect(calls).toEqual(['prisma generate', 'prisma migrate deploy']);
  });

  it('treats a missing command as a failed build', () => {
    function spawn(): SpawnResult {
      return { status: null };
    }

    expect(runVercelBuild({ DATABASE_URL: 'postgresql://album/db' }, spawn)).toBe(1);
  });
});

describe('migrate decision matches prisma.config', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function expectSameDecision(env: {
    DATABASE_URL: string;
    DATABASE_URL_UNPOOLED: string;
  }): Promise<void> {
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', env.DATABASE_URL);
    vi.stubEnv('DATABASE_URL_UNPOOLED', env.DATABASE_URL_UNPOOLED);
    const { default: config } = await import('../../../prisma.config');
    const { shouldDeployMigrations: decide } = await import('../../../scripts/vercel-build.mjs');

    expect(decide(process.env)).toBe(Boolean(config.datasource?.url));
  }

  it('agrees when neither URL is set', async () => {
    await expectSameDecision({ DATABASE_URL: '', DATABASE_URL_UNPOOLED: '' });
  });

  it('agrees when only DATABASE_URL is set', async () => {
    await expectSameDecision({
      DATABASE_URL: 'postgresql://album/pool',
      DATABASE_URL_UNPOOLED: '',
    });
  });

  it('agrees when only the unpooled URL is set', async () => {
    await expectSameDecision({
      DATABASE_URL: '',
      DATABASE_URL_UNPOOLED: 'postgresql://album/direct',
    });
  });

  it('agrees when both URLs are set', async () => {
    await expectSameDecision({
      DATABASE_URL: 'postgresql://album/pool',
      DATABASE_URL_UNPOOLED: 'postgresql://album/direct',
    });
  });
});
