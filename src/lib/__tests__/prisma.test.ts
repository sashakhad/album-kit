import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getPrisma', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(globalThis as typeof globalThis & { prisma?: unknown }, 'prisma');
  });

  it('throws a clear error when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;
    vi.doMock('server-only', () => ({}));
    vi.doMock('@prisma/adapter-pg', () => ({
      PrismaPg: class {
        constructor(_options: { connectionString: string }) {}
      },
    }));
    vi.doMock('@/generated/prisma/client', () => ({
      PrismaClient: class {
        constructor(_options: unknown) {}
      },
    }));

    const { getPrisma } = await import('../prisma');

    expect(() => getPrisma()).toThrow(/DATABASE_URL is not set/i);
  });

  it('returns the same client instance on repeated calls', async () => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/scaffold';
    vi.doMock('server-only', () => ({}));
    vi.doMock('@prisma/adapter-pg', () => ({
      PrismaPg: class {
        constructor(_options: { connectionString: string }) {}
      },
    }));
    vi.doMock('@/generated/prisma/client', () => ({
      PrismaClient: class {
        constructor(_options: unknown) {}
      },
    }));

    const { getPrisma } = await import('../prisma');
    const first = getPrisma();
    const second = getPrisma();

    expect(first).toBe(second);
  });
});
