import type { Prisma } from '@/generated/prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { parseCanonicalTake } from '@/lib/album/parse-filename';
import { takeStreamProblem } from '@/lib/album/stream-url';
import { requireOwner } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';
import { promptAttribution } from '@/lib/rounds/preflight';

export const runtime = 'nodejs';

const schema = z.object({
  filename: z.string(),
  promptId: z.string().min(1),
  style: z.string().min(1),
  writerHost: z.enum(['grok-bot', 'cursor']),
  writerProvider: z.string().nullable(),
  requestedModel: z.string().nullable(),
  observedModel: z.string().nullable(),
  executionId: z.string().nullable(),
  promptRevision: z.number().int().positive(),
  sunoModel: z.string().nullable(),
  generationId: z.string().nullable(),
  generationSettings: z.record(z.string(), z.unknown()),
  outputId: z.string().nullable(),
  clipId: z.string().min(1).nullable().optional(),
  streamUrl: z.string().min(1).nullable().optional(),
  roundId: z.string().min(1),
});

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const raw: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  const take = parsed.success ? parseCanonicalTake(parsed.data.filename) : null;
  if (!parsed.success || take === null) {
    return NextResponse.json({ error: 'Invalid take provenance' }, { status: 400 });
  }
  const input = parsed.data;
  const round = await prisma.generationRound.findUnique({ where: { id: input.roundId } });
  if (round === null) return NextResponse.json({ error: 'Unknown round' }, { status: 404 });
  const snapshot = round.snapshot as {
    prompts?: Array<{
      id: string;
      trackNumber: number;
      lane: number;
      style: string;
      writerHost: string;
      writerProvider: string | null;
      requestedModel: string | null;
      observedModel: string | null;
      revision: number;
      executionId: string | null;
    }>;
    resolvedSunoModel?: string;
    variation?: {
      requestId: string;
      parentTakeFilename: string;
      trackNumber: number;
      instructions: string;
    };
  };
  const planned = snapshot.prompts?.find(
    prompt =>
      prompt.id === input.promptId &&
      prompt.trackNumber === take.trackNumber &&
      prompt.lane === take.promptLane
  );
  if (
    planned === undefined ||
    (snapshot.variation !== undefined && snapshot.variation.trackNumber !== take.trackNumber) ||
    planned.style !== input.style ||
    planned.writerHost !== input.writerHost ||
    planned.writerProvider !== input.writerProvider ||
    planned.requestedModel !== input.requestedModel ||
    planned.observedModel !== input.observedModel ||
    planned.revision !== input.promptRevision ||
    planned.executionId !== input.executionId
  ) {
    return NextResponse.json(
      { error: 'Provenance differs from the round snapshot' },
      { status: 409 }
    );
  }
  if (
    input.sunoModel !== null &&
    (input.sunoModel !== snapshot.resolvedSunoModel ||
      input.generationId === null ||
      input.outputId === null)
  ) {
    return NextResponse.json(
      { error: 'Actual Suno model needs matching generation and output evidence' },
      { status: 409 }
    );
  }
  const streamProblem = takeStreamProblem({
    outputId: input.outputId,
    clipId: input.clipId ?? null,
    streamUrl: input.streamUrl ?? null,
  });
  if (streamProblem !== null) {
    return NextResponse.json({ error: streamProblem }, { status: 400 });
  }
  const writer = promptAttribution({
    id: input.promptId,
    host: input.writerHost,
    provider: input.writerProvider,
    requestedModel: input.requestedModel,
    observedModel: input.observedModel,
    executionId: input.executionId,
    revision: input.promptRevision,
  });
  const clipId =
    input.clipId ??
    (input.streamUrl !== undefined && input.streamUrl !== null ? input.outputId : null);
  const existing = await prisma.takeProvenance.findUnique({ where: { filename: input.filename } });
  if (existing !== null) {
    if (input.streamUrl === undefined || input.streamUrl === null)
      return NextResponse.json(existing);
    const updated = await prisma.takeProvenance.update({
      where: { filename: input.filename },
      data: {
        clipId,
        streamUrl: input.streamUrl,
        ...(existing.outputId === null && input.outputId !== null
          ? { outputId: input.outputId }
          : {}),
      },
    });
    return NextResponse.json(updated);
  }
  const created = await prisma.takeProvenance.create({
    data: {
      filename: input.filename,
      promptId: input.promptId,
      style: input.style,
      writerHost: writer.writerHost,
      writerProvider: writer.writerProvider,
      requestedModel: writer.requestedModel,
      observedModel: writer.observedModel,
      attribution: writer.attribution,
      promptRevision: writer.revision,
      executionId: writer.executionId,
      sunoModel: input.sunoModel,
      generationId: input.generationId,
      generationSettings: input.generationSettings as Prisma.InputJsonValue,
      outputId: input.outputId,
      clipId,
      streamUrl: input.streamUrl ?? null,
      roundId: input.roundId,
      parentTakeFilename: snapshot.variation?.parentTakeFilename ?? null,
      variationRequestId: snapshot.variation?.requestId ?? null,
      promptInstructions: snapshot.variation?.instructions ?? null,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
