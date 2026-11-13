import { z } from 'zod';

export const SETTINGS_VERSION = 1;

export const settingsSchema = z.object({
  preset: z.enum(['quick-start', 'studio', 'small-test', 'imported']).default('quick-start'),
  sunoModel: z.string().min(1).default('auto'),
  promptWriter: z.enum(['grok-bot', 'cursor']).default('grok-bot'),
  promptWriterModel: z.string().trim().min(1).max(120).default('auto'),
  promptVariations: z.number().int().min(1).max(20).default(5),
  generationsPerPrompt: z.number().int().min(1).max(10).default(1),
  listeningDetails: z.enum(['visible', 'reveal-after-vote', 'keep-hidden']).default('visible'),
  maskPromptModels: z.boolean().default(false),
  mood: z.string().max(200).default(''),
  vocals: z.enum(['instrumental', 'sung', 'chops']).default('instrumental'),
  musicalConstraints: z.string().max(2000).default(''),
  visibility: z.enum(['unset', 'public', 'private']).default('unset'),
  listenerVoting: z.boolean().default(false),
  // Public review takes stream a Suno MP4. Private ones are downloaded.
  reviewTakes: z.enum(['public', 'private']).default('public'),
  generationCreditLimit: z.number().int().min(0).nullable().default(null),
  downloadLimit: z.number().int().min(0).nullable().default(null),
  externalSpendLimitUsd: z.number().min(0).nullable().default(null),
});

export type AlbumSettingsValue = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = z
  .object({
    preset: settingsSchema.shape.preset.removeDefault(),
    sunoModel: settingsSchema.shape.sunoModel.removeDefault(),
    promptWriter: settingsSchema.shape.promptWriter.removeDefault(),
    promptWriterModel: settingsSchema.shape.promptWriterModel.removeDefault(),
    promptVariations: settingsSchema.shape.promptVariations.removeDefault(),
    generationsPerPrompt: settingsSchema.shape.generationsPerPrompt.removeDefault(),
    listeningDetails: settingsSchema.shape.listeningDetails.removeDefault(),
    maskPromptModels: settingsSchema.shape.maskPromptModels.removeDefault(),
    mood: settingsSchema.shape.mood.removeDefault(),
    vocals: settingsSchema.shape.vocals.removeDefault(),
    musicalConstraints: settingsSchema.shape.musicalConstraints.removeDefault(),
    visibility: settingsSchema.shape.visibility.removeDefault(),
    listenerVoting: settingsSchema.shape.listenerVoting.removeDefault(),
    reviewTakes: settingsSchema.shape.reviewTakes.removeDefault(),
    generationCreditLimit: settingsSchema.shape.generationCreditLimit.removeDefault(),
    downloadLimit: settingsSchema.shape.downloadLimit.removeDefault(),
    externalSpendLimitUsd: settingsSchema.shape.externalSpendLimitUsd.removeDefault(),
  })
  .partial()
  .strict();
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
  if (preset === 'imported') return { preset };
  if (preset === 'small-test') {
    return { preset, promptWriter: 'grok-bot', promptVariations: 2, generationsPerPrompt: 1 };
  }
  if (preset === 'studio') {
    return { preset, promptWriter: 'cursor', promptVariations: 5 };
  }
  return { preset, promptWriter: 'grok-bot', promptVariations: 5, generationsPerPrompt: 1 };
}

export function settingsChanges(
  saved: AlbumSettingsValue,
  draft: AlbumSettingsValue
): SettingsPatch {
  const presetFields = saved.preset === draft.preset ? {} : presetSettings(draft.preset);
  return Object.fromEntries(
    Object.entries(draft).filter(
      ([name, value]) => value !== saved[name as keyof AlbumSettingsValue] || name in presetFields
    )
  );
}

const portableSchema = z
  .object({
    version: z.literal(SETTINGS_VERSION),
    settings: settingsSchema
      .pick({
        preset: true,
        sunoModel: true,
        promptWriter: true,
        promptWriterModel: true,
        promptVariations: true,
        generationsPerPrompt: true,
        listeningDetails: true,
        maskPromptModels: true,
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
    promptWriterModel: settings.promptWriterModel,
    promptVariations: settings.promptVariations,
    generationsPerPrompt: settings.generationsPerPrompt,
    listeningDetails: settings.listeningDetails,
    maskPromptModels: settings.maskPromptModels,
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
  return { ...parsed.settings, preset: 'imported', visibility: 'unset', listenerVoting: false };
}
