import { createHash } from 'node:crypto';
import { z } from 'zod';

import { resolveSunoModel, sunoCapabilitiesSchema } from '@/lib/rounds/preflight';
import type { AlbumSettingsValue } from '@/lib/settings/schema';

export const webhookQuoteSchema = z.object({
  capabilities: sunoCapabilitiesSchema,
  writerReady: z.boolean(),
  hostingEligibilityVerified: z.boolean(),
  externalSpendEstimateUsd: z.number().min(0),
  hostingChargeEstimateUsd: z.number().min(0),
  /** A reference worker sets this. A live Suno check omits it or sends false. */
  fixture: z.boolean().optional(),
});

export type WebhookQuote = z.infer<typeof webhookQuoteSchema>;

const STANDARD_CREDITS_PER_GENERATION = 10;
const STANDARD_OUTPUTS_PER_GENERATION = 2;

/** Cost shown when no webhook is configured. Album Bot rechecks the live account before spending. */
export function allowanceQuoteProvider(
  settings: AlbumSettingsValue,
  now: Date = new Date()
): WebhookQuote {
  const model = settings.sunoModel === 'auto' ? 'v6' : settings.sunoModel;
  return {
    capabilities: {
      availableModels: [model],
      qualityDefault: model,
      costModel: model,
      creditsPerGeneration: STANDARD_CREDITS_PER_GENERATION,
      outputsPerGeneration: STANDARD_OUTPUTS_PER_GENERATION,
      downloadsPerOutput: 0,
      generationCreditsAvailable: 1_000_000,
      downloadsAvailable: 0,
      checkedAt: now.toISOString(),
    },
    writerReady: settings.promptWriter !== 'cursor',
    hostingEligibilityVerified: true,
    externalSpendEstimateUsd: 0,
    hostingChargeEstimateUsd: 0,
  };
}

export function estimateVariation(args: {
  requestedTakes: number;
  settings: AlbumSettingsValue;
  creditsAlreadyReserved: number;
  provider: WebhookQuote;
}) {
  const provider = webhookQuoteSchema.parse(args.provider);
  const { capabilities } = provider;
  const { model, migration } = resolveSunoModel(args.settings.sunoModel, capabilities);
  const generations = Math.ceil(args.requestedTakes / capabilities.outputsPerGeneration);
  const expectedOutputs = generations * capabilities.outputsPerGeneration;
  const generationCredits = generations * capabilities.creditsPerGeneration;
  const downloadsPerTake =
    args.settings.reviewTakes === 'private' ? capabilities.downloadsPerOutput : 0;
  const downloadCredits = expectedOutputs * downloadsPerTake;
  const remainingAllowance = Math.max(
    0,
    args.settings.variationCreditAllowance - args.creditsAlreadyReserved
  );
  const blockers: string[] = [];
  const checkedAt = Date.parse(capabilities.checkedAt);
  if (provider.fixture === true)
    blockers.push('This cost check is a fixture, not a live Suno account.');
  if (checkedAt > Date.now() + 5 * 60_000 || Date.now() - checkedAt > 15 * 60_000)
    blockers.push('Refresh the Suno account and cost check before generating.');
  if (migration !== null) blockers.push(`Saved model ${args.settings.sunoModel} is unavailable.`);
  if (
    (args.settings.sunoModel === 'auto' || migration !== null) &&
    (capabilities.qualityDefault === null ||
      !capabilities.availableModels.includes(capabilities.qualityDefault)) &&
    capabilities.availableModels.length > 1
  )
    blockers.push('Suno did not identify an eligible quality default; choose a verified model.');
  if (capabilities.costModel !== model)
    blockers.push(`The generation credit rate for ${model} is unverified.`);
  if (
    capabilities.generationCreditsAvailable !== null &&
    generationCredits > capabilities.generationCreditsAvailable
  )
    blockers.push(
      `Need ${generationCredits} credits; the account has ${capabilities.generationCreditsAvailable}.`
    );
  if (
    args.settings.generationCreditLimit !== null &&
    generationCredits > args.settings.generationCreditLimit
  )
    blockers.push('This request exceeds the saved per-round generation limit.');
  if (args.settings.reviewTakes === 'private') {
    if (downloadsPerTake === 0) blockers.push('Private-take download cost is unverified.');
    if (downloadCredits > capabilities.downloadsAvailable)
      blockers.push('The account lacks enough download credits for private review takes.');
    if (args.settings.downloadLimit !== null && downloadCredits > args.settings.downloadLimit)
      blockers.push('This request exceeds the saved download limit.');
  }
  if (!provider.writerReady) blockers.push('The configured prompt writer is not ready.');
  if (args.settings.promptWriter === 'cursor')
    blockers.push(
      'Site generation with the Cursor writer needs a verified integration. Select Grok Bot for now.'
    );
  if (!provider.hostingEligibilityVerified)
    blockers.push('Hosting eligibility has not been verified.');
  if (
    args.settings.externalSpendLimitUsd !== null &&
    provider.externalSpendEstimateUsd > args.settings.externalSpendLimitUsd
  )
    blockers.push('External prompt cost exceeds the saved USD limit.');
  const quoteKey = createHash('sha256')
    .update(
      JSON.stringify({
        model,
        generations,
        expectedOutputs,
        generationCredits,
        downloadCredits,
        externalSpendEstimateUsd: provider.externalSpendEstimateUsd,
        hostingChargeEstimateUsd: provider.hostingChargeEstimateUsd,
        reviewTakes: args.settings.reviewTakes,
      })
    )
    .digest('hex');
  return {
    model,
    generations,
    expectedOutputs,
    generationCredits,
    downloadsPerTake,
    downloadCredits,
    externalSpendEstimateUsd: provider.externalSpendEstimateUsd,
    hostingChargeEstimateUsd: provider.hostingChargeEstimateUsd,
    remainingAllowance,
    requiresConfirmation:
      generationCredits > remainingAllowance ||
      provider.externalSpendEstimateUsd + provider.hostingChargeEstimateUsd > 0,
    blockers,
    quoteKey,
  };
}

export type VariationQuote = ReturnType<typeof estimateVariation>;
