import { Prisma } from '@/generated/prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireOwner, OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';
import { DEFAULT_SETTINGS, settingsPatchSchema, settingsSchema } from '@/lib/settings/schema';
import { isBlindForSnapshot } from '@/lib/votes/exposure';
import { getVoteSnapshot } from '@/lib/votes/board';
import type { VariationQuote } from '@/lib/variations/quote';
import { loadVariationQuote } from '@/lib/variations/service';
import { callVariationWebhook, VariationWebhookError } from '@/lib/variations/webhook';

export const runtime = 'nodejs';

const inputSchema = z.object({
  id: z.uuid(),
  quoteKey: z.string().regex(/^[0-9a-f]{64}$/),
  confirmExtraCost: z.boolean().default(false),
});
const acceptedSchema = z.object({ operationId: z.uuid(), status: z.literal('accepted') });

class DispatchConflict extends Error {
  constructor(
    message: string,
    public readonly quote?: VariationQuote
  ) {
    super(message);
  }
}

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid generation request.' }, { status: 400 });
  const row = await prisma.variationRequest.findUnique({ where: { id: parsed.data.id } });
  if (row === null) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  if (row.status === 'generating' || row.status === 'ready')
    return NextResponse.json({
      status: row.status,
      requestId: row.id,
      dispatchUncertain: row.status === 'generating' && row.dispatchError !== null,
    });
  if (row.status !== 'requested' || row.roundId !== null)
    return NextResponse.json(
      { error: row.dispatchError ?? 'This request cannot be started again.' },
      { status: 409 }
    );
  const input = {
    id: row.id,
    trackNumber: row.trackNumber,
    parentTakeFilename: row.parentTakeFilename,
    requestedTakes: row.requestedTakes,
    instructions: row.instructions,
  };
  let loaded: Awaited<ReturnType<typeof loadVariationQuote>>;
  try {
    loaded = await loadVariationQuote(input);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not verify the generation cost.' },
      { status: error instanceof VariationWebhookError ? 503 : 409 }
    );
  }
  const { quote, context, settings } = loaded;
  if (
    await isBlindForSnapshot(
      OWNER_VISITOR_ID,
      settings.listeningDetails,
      await getVoteSnapshot(OWNER_VISITOR_ID)
    )
  )
    return NextResponse.json(
      { error: 'Reveal this pass before generating more takes.' },
      { status: 409 }
    );
  if (quote.blockers.length > 0)
    return NextResponse.json({ error: quote.blockers.join(' '), quote }, { status: 409 });
  if (quote.quoteKey !== parsed.data.quoteKey)
    return NextResponse.json(
      { error: 'The cost changed. Review the new estimate.', quote },
      { status: 409 }
    );
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await prisma.$transaction(
          async tx => {
            const [current, stored, reserved] = await Promise.all([
              tx.variationRequest.findUnique({ where: { id: row.id } }),
              tx.albumSettings.findUnique({ where: { id: 'default' } }),
              tx.variationRequest.aggregate({ _sum: { creditsReserved: true } }),
            ]);
            if (current?.status !== 'requested' || current.roundId !== null)
              throw new DispatchConflict('This request is already being handled.');
            const latest =
              stored === null
                ? DEFAULT_SETTINGS
                : settingsSchema.parse({
                    ...settingsSchema.parse(stored.defaults),
                    ...settingsPatchSchema.parse(stored.overrides),
                  });
            if (
              latest.sunoModel !== settings.sunoModel ||
              latest.reviewTakes !== settings.reviewTakes ||
              latest.promptWriter !== settings.promptWriter ||
              latest.promptWriterModel !== settings.promptWriterModel ||
              latest.generationCreditLimit !== settings.generationCreditLimit ||
              latest.downloadLimit !== settings.downloadLimit ||
              latest.externalSpendLimitUsd !== settings.externalSpendLimitUsd
            )
              throw new DispatchConflict('Settings changed. Review the cost again.');
            const remaining = Math.max(
              0,
              latest.variationCreditAllowance - (reserved._sum.creditsReserved ?? 0)
            );
            if (
              (quote.generationCredits > remaining ||
                quote.externalSpendEstimateUsd + quote.hostingChargeEstimateUsd > 0) &&
              !parsed.data.confirmExtraCost
            )
              throw new DispatchConflict('Confirm the additional cost in the form.', {
                ...quote,
                remainingAllowance: remaining,
                requiresConfirmation: true,
              });
            const changed = await tx.variationRequest.updateMany({
              where: { id: row.id, status: 'requested', roundId: null },
              data: {
                status: 'generating',
                creditsReserved: quote.generationCredits,
                quotedModel: quote.model,
                quotedExpectedOutputs: quote.expectedOutputs,
                quotedDownloadCredits: quote.downloadCredits,
                quotedExternalSpendUsd: quote.externalSpendEstimateUsd,
                quotedHostingChargeUsd: quote.hostingChargeEstimateUsd,
                dispatchError: null,
              },
            });
            if (changed.count !== 1)
              throw new DispatchConflict('This request is already being handled.');
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        break;
      } catch (error) {
        if (
          attempt < 2 &&
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2034'
        )
          continue;
        throw error;
      }
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Could not reserve this request.',
        ...(error instanceof DispatchConflict && error.quote ? { quote: error.quote } : {}),
      },
      { status: 409 }
    );
  }
  try {
    const accepted = acceptedSchema.parse(
      await callVariationWebhook('generate', {
        ...context,
        operationId: row.id,
        quote,
        callbackPath: '/api/owner/variations/callback',
      })
    );
    if (accepted.operationId !== row.id) throw new Error('Webhook operation ID did not match.');
    return NextResponse.json({ status: 'generating', requestId: row.id }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation was not confirmed.';
    const definitelyNotCharged =
      error instanceof VariationWebhookError && error.definitelyNotCharged;
    await prisma.variationRequest.updateMany({
      where: { id: row.id, status: 'generating' },
      data: {
        // An unacknowledged dispatch may still be running. Keep its ID and reservation
        // live so late worker progress can reconcile without a second paid call.
        status: definitelyNotCharged ? 'failed' : 'generating',
        dispatchError: message,
        ...(definitelyNotCharged ? { creditsReserved: 0 } : {}),
      },
    });
    return NextResponse.json(
      {
        error: message,
        status: definitelyNotCharged ? 'failed' : 'generating',
        dispatchUncertain: !definitelyNotCharged,
        requestId: row.id,
      },
      { status: definitelyNotCharged ? 502 : 202 }
    );
  }
}
