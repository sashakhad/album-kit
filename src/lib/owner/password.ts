import 'server-only';

import { prisma } from '@/lib/prisma';

export const OWNER_PASSWORD_ID = 'owner';

const CACHE_MS = 5_000;

type Cache = {
  env: string | null;
  current: string | null;
  loadedAt: number;
};

let cache: Cache | null = null;

export function readEnvAlbumKey(): string | null {
  const key = process.env.ALBUM_KEY;
  return key === undefined || key.length === 0 ? null : key;
}

/** A new password the owner picked. Existing ALBUM_KEY values are not rechecked. */
export function usableOwnerPassword(value: string): string | null {
  const password = value.trim();
  if (password.length < 4 || password.length > 200) return null;
  if (/[\r\n]/.test(password) || password === '[SENSITIVE]') return null;
  return password;
}

export function resetOwnerPasswordCache(): void {
  cache = null;
}

export function ownerSecrets(): string[] {
  const env = readEnvAlbumKey();
  const current = cache !== null && cache.env === env ? cache.current : env;
  const secrets: string[] = [];
  if (current !== null) secrets.push(current);
  if (env !== null && env !== current) secrets.push(env);
  return secrets;
}

export async function loadOwnerPassword(): Promise<string | null> {
  const env = readEnvAlbumKey();
  if (cache !== null && cache.env === env && Date.now() - cache.loadedAt < CACHE_MS) {
    return cache.current;
  }
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.length === 0) {
    cache = { env, current: env, loadedAt: Date.now() };
    return env;
  }

  try {
    const row = await prisma.ownerPassword.findUnique({ where: { id: OWNER_PASSWORD_ID } });
    if (row === null || row.envAtChange !== (env ?? '')) {
      if (row !== null) {
        await prisma.ownerPassword.delete({ where: { id: OWNER_PASSWORD_ID } }).catch(() => null);
      }
      cache = { env, current: env, loadedAt: Date.now() };
      return env;
    }
    cache = { env, current: row.password, loadedAt: Date.now() };
    return row.password;
  } catch {
    cache = { env, current: env, loadedAt: Date.now() };
    return env;
  }
}

export async function saveOwnerPassword(password: string): Promise<void> {
  const env = readEnvAlbumKey();
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.length === 0) {
    throw new Error('The album database is not connected, so the password cannot be saved here.');
  }
  await prisma.ownerPassword.upsert({
    where: { id: OWNER_PASSWORD_ID },
    create: { id: OWNER_PASSWORD_ID, password, envAtChange: env ?? '' },
    update: { password, envAtChange: env ?? '' },
  });
  cache = { env, current: password, loadedAt: Date.now() };
}
