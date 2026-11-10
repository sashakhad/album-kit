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
  return prisma.$transaction(async tx => {
    const current = decode(await tx.albumSettings.findUnique({ where: { id: 'default' } }));
    const defaults =
      target === 'defaults'
        ? settingsSchema.parse({ ...current.defaults, ...valid })
        : current.defaults;
    const overrides =
      target === 'overrides' ? { ...current.overrides, ...valid } : current.overrides;
    const row = await tx.albumSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        version: SETTINGS_VERSION,
        defaults: defaults as Prisma.InputJsonValue,
        overrides: overrides as Prisma.InputJsonValue,
      },
      update: {
        version: SETTINGS_VERSION,
        defaults: defaults as Prisma.InputJsonValue,
        overrides: overrides as Prisma.InputJsonValue,
      },
    });
    return decode(row);
  });
}
