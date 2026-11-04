// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

async function cliUrl(env: { DATABASE_URL: string; DATABASE_URL_UNPOOLED: string }) {
  vi.stubEnv('DATABASE_URL', env.DATABASE_URL);
  vi.stubEnv('DATABASE_URL_UNPOOLED', env.DATABASE_URL_UNPOOLED);
  const { default: config } = await import('../../../prisma.config');
  return config.datasource?.url;
}

describe('prisma.config', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("runs the CLI over Neon's direct connection when it is set", async () => {
    await expect(
      cliUrl({
        DATABASE_URL: 'postgresql://neon-pooler/neondb',
        DATABASE_URL_UNPOOLED: 'postgresql://neon-direct/neondb',
      })
    ).resolves.toBe('postgresql://neon-direct/neondb');
  });

  it('falls back to DATABASE_URL', async () => {
    await expect(
      cliUrl({ DATABASE_URL: 'postgresql://localhost/scaffold', DATABASE_URL_UNPOOLED: '' })
    ).resolves.toBe('postgresql://localhost/scaffold');
  });

  it('leaves the URL out when neither is set, so prisma generate still runs', async () => {
    await expect(cliUrl({ DATABASE_URL: '', DATABASE_URL_UNPOOLED: '' })).resolves.toBeUndefined();
  });
});
