import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  resolveSettings,
  settingsPatchSchema,
  settingsSchema,
  type AlbumSettingsValue,
  type SettingsPatch,
  type StoredSettings,
} from '@/lib/settings/schema';

function decode(
  row: { version: number; defaults: unknown; overrides: unknown } | null
): StoredSettings {
  if (row === null) {
    return { version: SETTINGS_VERSION, defaults: DEFAULT_SETTINGS, overrides: {} };
  }
  return {
    version: row.version,
    defaults: settingsSchema.parse(row.defaults),
    overrides: settingsPatchSchema.parse(row.overrides),
  };
}

export async function loadStoredSettings(): Promise<StoredSettings> {
  return decode(await prisma.albumSettings.findUnique({ where: { id: 'default' } }));
}

export async function loadSettings(): Promise<AlbumSettingsValue> {
  return resolveSettings(await loadStoredSettings());
}

export async function saveSettingsPatch(
  patch: SettingsPatch,
  target: 'defaults' | 'overrides' = 'overrides'
): Promise<StoredSettings> {
  const valid = settingsPatchSchema.parse(patch);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(
        async tx => {
          const current = decode(await tx.albumSettings.findUnique({ where: { id: 'default' } }));
          const defaults =
            target === 'defaults'
              ? settingsSchema.parse({ ...current.defaults, ...valid })
              : current.defaults;
          const overrides =
            target === 'overrides' ? { ...current.overrides, ...valid } : current.overrides;
          const values = {
            version: SETTINGS_VERSION,
            defaults: defaults as Prisma.InputJsonValue,
            overrides: overrides as Prisma.InputJsonValue,
          };
          return decode(
            await tx.albumSettings.upsert({
              where: { id: 'default' },
              create: { id: 'default', ...values },
              update: values,
            })
          );
        },
        { isolationLevel: 'Serializable' }
      );
    } catch (error) {
      // Retry a write conflict so simultaneous chat and site patches merge.
      if (
        attempt >= 2 ||
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'P2034'
      )
        throw error;
    }
  }
}
