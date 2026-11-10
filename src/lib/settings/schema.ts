import { z } from 'zod';

export const SETTINGS_VERSION = 1;

export const settingsSchema = z.object({
  preset: z.enum(['quick-start', 'studio', 'small-test', 'imported']).default('quick-start'),
  sunoModel: z.string().min(1).default('auto'),
  promptWriter: z.enum(['grok-bot', 'cursor']).default('grok-bot'),
  promptVariations: z.number().int().min(1).max(20).default(5),
  generationsPerPrompt: z.number().int().min(1).max(10).default(1),
  listeningDetails: z.enum(['visible', 'reveal-after-vote', 'keep-hidden']).default('visible'),
  mood: z.string().max(200).default(''),
  vocals: z.enum(['instrumental', 'sung', 'chops']).default('instrumental'),
  musicalConstraints: z.string().max(2000).default(''),
  visibility: z.enum(['unset', 'public', 'private']).default('unset'),
  generationCreditLimit: z.number().int().min(0).nullable().default(null),
  downloadLimit: z.number().int().min(0).nullable().default(null),
  externalSpendLimitUsd: z.number().min(0).nullable().default(null),
});

export type AlbumSettingsValue = z.infer<typeof settingsSchema>;
export const settingsPatchSchema = settingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const DEFAULT_SETTINGS: AlbumSettingsValue = settingsSchema.parse({});

export type StoredSettings = {
  version: number;
  defaults: AlbumSettingsValue;
  overrides: SettingsPatch;
};

export function resolveSettings(stored: StoredSettings): AlbumSettingsValue {
  if (stored.version !== SETTINGS_VERSION) {
    throw new Error(`Unsupported settings version ${stored.version}`);
  }
  return settingsSchema.parse({ ...stored.defaults, ...stored.overrides });
}

export function presetSettings(preset: AlbumSettingsValue['preset']): Partial<AlbumSettingsValue> {
  if (preset === 'small-test') {
    return { preset, promptVariations: 2, generationsPerPrompt: 1 };
  }
  if (preset === 'studio') {
    return { preset, promptWriter: 'cursor', promptVariations: 5 };
  }
  return { preset, promptWriter: 'grok-bot', promptVariations: 5, generationsPerPrompt: 1 };
}

const portableSchema = z
  .object({
    version: z.literal(SETTINGS_VERSION),
    settings: settingsSchema
      .pick({
        preset: true,
        sunoModel: true,
        promptWriter: true,
        promptVariations: true,
        generationsPerPrompt: true,
        listeningDetails: true,
        mood: true,
        vocals: true,
        musicalConstraints: true,
        generationCreditLimit: true,
        downloadLimit: true,
        externalSpendLimitUsd: true,
      })
      .strict(),
  })
  .strict();

export function exportPreset(settings: AlbumSettingsValue) {
  const portable = {
    preset: settings.preset,
    sunoModel: settings.sunoModel,
    promptWriter: settings.promptWriter,
    promptVariations: settings.promptVariations,
    generationsPerPrompt: settings.generationsPerPrompt,
    listeningDetails: settings.listeningDetails,
    mood: settings.mood,
    vocals: settings.vocals,
    musicalConstraints: settings.musicalConstraints,
    generationCreditLimit: settings.generationCreditLimit,
    downloadLimit: settings.downloadLimit,
    externalSpendLimitUsd: settings.externalSpendLimitUsd,
  };
  return portableSchema.parse({ version: SETTINGS_VERSION, settings: portable });
}

export function importPreset(raw: unknown): Partial<AlbumSettingsValue> {
  const parsed = portableSchema.parse(raw);
  return { ...parsed.settings, preset: 'imported', visibility: 'unset' };
}
