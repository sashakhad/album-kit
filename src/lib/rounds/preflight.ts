import { z } from 'zod';

import type { AlbumSettingsValue } from '@/lib/settings/schema';

export const sunoCapabilitiesSchema = z.object({
  availableModels: z.array(z.string().min(1)).min(1),
  qualityDefault: z.string().min(1).nullable(),
  costModel: z.string().min(1),
  creditsPerGeneration: z.number().int().positive(),
  outputsPerGeneration: z.number().int().positive(),
  downloadsPerOutput: z.number().int().min(0),
  generationCreditsAvailable: z.number().int().min(0),
  downloadsAvailable: z.number().int().min(0),
  checkedAt: z.string().datetime(),
});

export type SunoCapabilities = z.infer<typeof sunoCapabilitiesSchema>;

export function resolveSunoModel(
  policy: string,
  capabilities: SunoCapabilities
): { model: string; migration: string | null } {
  const available = new Set(capabilities.availableModels);
  const quality =
    capabilities.qualityDefault !== null && available.has(capabilities.qualityDefault)
      ? capabilities.qualityDefault
      : available.has('v6')
        ? 'v6'
        : capabilities.availableModels[0];
  if (quality === undefined) {
    throw new Error('Suno returned no available models');
  }
  if (policy === 'auto') {
    return { model: quality, migration: null };
  }
  if (available.has(policy)) {
    return { model: policy, migration: null };
  }
  return {
    model: quality,
    migration: `${policy} is unavailable; ${quality} is the current eligible quality model.`,
  };
}

export type RoundEstimate = {
  tracks: number;
  prompts: number;
  generations: number;
  expectedOutputs: number;
  generationCredits: number;
  /** Download credits charged for one review take. Zero when review takes stream. */
  downloadsPerTake: number;
  downloads: number;
  sunoModel: string;
  migration: string | null;
  externalSpendEstimateUsd: number;
  hostingChargeEstimateUsd: number;
  blockers: string[];
};

export function estimateRound(args: {
  tracks: number;
  settings: AlbumSettingsValue;
  capabilities: SunoCapabilities;
  externalSpendEstimateUsd?: number | undefined;
  hostingChargeEstimateUsd?: number | undefined;
  hostingEligibilityVerified?: boolean | undefined;
}): RoundEstimate {
  const capabilities = sunoCapabilitiesSchema.parse(args.capabilities);
  const tracks = z.number().int().positive().parse(args.tracks);
  const { model, migration } = resolveSunoModel(args.settings.sunoModel, capabilities);
  const prompts = tracks * args.settings.promptVariations;
  const generations = prompts * args.settings.generationsPerPrompt;
  const expectedOutputs = generations * capabilities.outputsPerGeneration;
  const generationCredits = generations * capabilities.creditsPerGeneration;
  // Public review streams a published clip MP4. Private review downloads every take.
  const downloadsPerTake =
    args.settings.reviewTakes === 'private' ? capabilities.downloadsPerOutput : 0;
  const downloads = expectedOutputs * downloadsPerTake;
  const blockers: string[] = [];
  if (args.settings.reviewTakes === 'private') {
    if (downloadsPerTake === 0) {
      blockers.push('Download credits per take must be checked before a private review round.');
    } else if (downloads > capabilities.downloadsAvailable) {
      blockers.push(
        `Need ${downloads} download credits (${downloadsPerTake} per take); ${capabilities.downloadsAvailable} available.`
      );
    }
    if (
      downloadsPerTake > 0 &&
      args.settings.downloadLimit !== null &&
      downloads > args.settings.downloadLimit
    ) {
      blockers.push(`Download estimate exceeds the ${args.settings.downloadLimit}-download limit.`);
    }
  }
  if (capabilities.costModel !== model) {
    blockers.push(
      `Generation cost for ${model} must be verified; the supplied rate is for ${capabilities.costModel}.`
    );
  }
  if (generationCredits > capabilities.generationCreditsAvailable) {
    blockers.push(
      `Need ${generationCredits} generation credits; ${capabilities.generationCreditsAvailable} available.`
    );
  }
  if (
    args.settings.generationCreditLimit !== null &&
    generationCredits > args.settings.generationCreditLimit
  ) {
    blockers.push(
      `Generation estimate exceeds the ${args.settings.generationCreditLimit}-credit limit.`
    );
  }
  if (args.settings.promptWriter === 'cursor' && args.externalSpendEstimateUsd === undefined) {
    blockers.push('Cursor model cost and execution path must be verified before this round.');
  }
  if (args.settings.promptWriter === 'cursor') {
    blockers.push(
      'Cursor prompt execution is not connected to this kit. Complete a verified Cursor handoff or use Grok Bot.'
    );
  }
  if (!args.hostingEligibilityVerified || args.hostingChargeEstimateUsd === undefined) {
    blockers.push('Hosting eligibility and required charges must be checked before this round.');
  }
  if (
    args.settings.externalSpendLimitUsd !== null &&
    (args.externalSpendEstimateUsd ?? 0) > args.settings.externalSpendLimitUsd
  ) {
    blockers.push('External model estimate exceeds the configured USD limit.');
  }
  return {
    tracks,
    prompts,
    generations,
    expectedOutputs,
    generationCredits,
    downloadsPerTake,
    downloads,
    sunoModel: model,
    migration,
    externalSpendEstimateUsd: args.externalSpendEstimateUsd ?? 0,
    hostingChargeEstimateUsd: args.hostingChargeEstimateUsd ?? 0,
    blockers,
  };
}

export type PromptAttribution = {
  id: string;
  writerHost: 'grok-bot' | 'cursor';
  writerProvider: string | null;
  requestedModel: string | null;
  observedModel: string | null;
  attribution: 'undisclosed' | 'verified' | 'unverified';
  revision: number;
  executionId: string | null;
};

export function promptAttribution(args: {
  id: string;
  host: 'grok-bot' | 'cursor';
  requestedModel?: string | null;
  observedModel?: string | null;
  provider?: string | null;
  executionId?: string | null;
  revision?: number;
}): PromptAttribution {
  const observedModel = args.host === 'grok-bot' ? null : (args.observedModel ?? null);
  return {
    id: args.id,
    writerHost: args.host,
    writerProvider: args.host === 'grok-bot' ? null : (args.provider ?? null),
    requestedModel: args.host === 'grok-bot' ? null : (args.requestedModel ?? null),
    observedModel,
    attribution:
      args.host === 'grok-bot'
        ? 'undisclosed'
        : observedModel === null ||
            args.provider === null ||
            args.provider === undefined ||
            args.executionId === null ||
            args.executionId === undefined
          ? 'unverified'
          : 'verified',
    revision: args.revision ?? 1,
    executionId: args.executionId ?? null,
  };
}
