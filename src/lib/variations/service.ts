import 'server-only';

import { prisma } from '@/lib/prisma';
import { loadSettings } from '@/lib/settings/store';
import { availableVariationParent, type VariationInput } from '@/lib/variations/parent';
import {
  allowanceQuoteProvider,
  estimateVariation,
  webhookQuoteSchema,
} from '@/lib/variations/quote';
import { callVariationWebhook, variationWebhookConfigured } from '@/lib/variations/webhook';

export async function loadVariationQuote(input: VariationInput) {
  const parent = await availableVariationParent(input);
  if (parent === null) throw new Error('The selected take is not available for this track.');
  const [settings, parentRecord, reserved] = await Promise.all([
    loadSettings(),
    prisma.takeProvenance.findUnique({
      where: { filename: parent.filename },
      select: { style: true },
    }),
    prisma.variationRequest.aggregate({ _sum: { creditsReserved: true } }),
  ]);
  const context = {
    requestId: input.id,
    trackNumber: input.trackNumber,
    trackTitle: parent.trackTitle,
    parentTakeFilename: parent.filename,
    parentStyle: parentRecord?.style ?? null,
    requestedTakes: input.requestedTakes,
    instructions: input.instructions,
    sunoModelPolicy: settings.sunoModel,
    promptWriter: settings.promptWriter,
    promptWriterModel: settings.promptWriterModel,
    reviewTakes: settings.reviewTakes,
  };
  const liveAccountChecked = variationWebhookConfigured();
  const provider = liveAccountChecked
    ? webhookQuoteSchema.parse(await callVariationWebhook('quote', context))
    : allowanceQuoteProvider(settings);
  const quote = estimateVariation({
    requestedTakes: input.requestedTakes,
    settings,
    creditsAlreadyReserved: reserved._sum.creditsReserved ?? 0,
    provider,
  });
  return { quote, context, settings, liveAccountChecked };
}
