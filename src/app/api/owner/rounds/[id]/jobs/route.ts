import { Prisma } from '@/generated/prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { parseCanonicalTake } from '@/lib/album/parse-filename';
import { requireOwner } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';
import { jobOutputSchema } from '@/lib/rounds/job-output';

export const runtime = 'nodejs';

const jobSchema = z.object({
  operationId: z.string().min(1).max(200),
  promptId: z.string().min(1).max(100),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const { id } = await context.params;
  const raw: unknown = await request.json().catch(() => null);
  const parsed = jobSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const result = await prisma.$transaction(
    async tx => {
      const existing = await tx.providerJob.findUnique({
        where: { operationId: parsed.data.operationId },
      });
      if (existing !== null)
        return {
          kind:
            existing.roundId === id && existing.promptId === parsed.data.promptId
              ? 'existing'
              : 'conflict',
          job: existing,
        } as const;
      const round = await tx.generationRound.findUnique({ where: { id } });
      if (round === null) return { kind: 'missing' } as const;
      if (round.authorization === null) return { kind: 'unauthorized' } as const;
      if (round.status === 'ready-to-listen') return { kind: 'ready' } as const;
      const snapshot = round.snapshot as {
        prompts?: Array<{ id: string }>;
        settings?: { generationsPerPrompt: number };
      };
      if (!snapshot.prompts?.some(prompt => prompt.id === parsed.data.promptId))
        return { kind: 'unknown-prompt' } as const;
      const promptCount = await tx.providerJob.count({
        where: { roundId: id, promptId: parsed.data.promptId },
      });
      if (promptCount >= (snapshot.settings?.generationsPerPrompt ?? 0))
        return { kind: 'prompt-full' } as const;
      const estimate = round.estimate as { generations: number };
      const count = await tx.providerJob.count({ where: { roundId: id } });
      if (count >= estimate.generations) return { kind: 'full' } as const;
      const job = await tx.providerJob.create({ data: { roundId: id, ...parsed.data } });
      return { kind: 'created', job } as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  if (result.kind === 'missing')
    return NextResponse.json({ error: 'Unknown round' }, { status: 404 });
  if (result.kind === 'unauthorized')
    return NextResponse.json({ error: 'Round is not authorized' }, { status: 409 });
  if (result.kind === 'full')
    return NextResponse.json({ error: 'Round generation allowance is full' }, { status: 409 });
  if (result.kind === 'unknown-prompt')
    return NextResponse.json({ error: 'Prompt is not in the round snapshot' }, { status: 409 });
  if (result.kind === 'prompt-full')
    return NextResponse.json(
      { error: 'This prompt has reached its generation allowance' },
      { status: 409 }
    );
  if (result.kind === 'ready')
    return NextResponse.json({ error: 'Round is already ready to listen' }, { status: 409 });
  if (result.kind === 'conflict')
    return NextResponse.json({ error: 'Operation ID belongs to another job' }, { status: 409 });
  return NextResponse.json(result.job, { status: result.kind === 'created' ? 201 : 200 });
}

const updateSchema = z.object({
  operationId: z.string().min(1),
  providerId: z.string().min(1).optional(),
  status: z.enum(['accepted', 'accepted-untracked', 'collecting', 'complete', 'blocked']),
  reason: z.string().min(1).optional(),
  output: jobOutputSchema.optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const { id } = await context.params;
  const raw: unknown = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const job = await prisma.providerJob.findUnique({
    where: { operationId: parsed.data.operationId },
  });
  if (job === null || job.roundId !== id)
    return NextResponse.json({ error: 'Unknown job' }, { status: 404 });
  if (
    parsed.data.status === 'accepted' &&
    parsed.data.providerId === undefined &&
    job.providerId === null
  ) {
    return NextResponse.json(
      { error: 'Save the provider job ID when generation is accepted' },
      { status: 400 }
    );
  }
  if (parsed.data.status === 'accepted-untracked' && parsed.data.reason === undefined) {
    return NextResponse.json(
      { error: 'Explain why the provider ID is unavailable' },
      { status: 400 }
    );
  }
  if (
    job.providerId !== null &&
    parsed.data.providerId !== undefined &&
    job.providerId !== parsed.data.providerId
  ) {
    return NextResponse.json({ error: 'Cannot replace an accepted provider ID' }, { status: 409 });
  }
  if (job.status === 'complete' && parsed.data.status !== 'complete')
    return NextResponse.json({ error: 'A complete job cannot move backwards' }, { status: 409 });
  const output =
    parsed.data.output ??
    (job.output === null ? null : (jobOutputSchema.safeParse(job.output).data ?? null));
  if (output !== null) {
    const filenames = new Set<string>();
    const outputIds = new Set<string>();
    const round = await prisma.generationRound.findUnique({ where: { id } });
    const snapshot = round?.snapshot as
      { prompts?: Array<{ id: string; trackNumber: number; lane: number }> } | undefined;
    const prompt = snapshot?.prompts?.find(item => item.id === job.promptId);
    for (const take of output.takes) {
      const canonical = parseCanonicalTake(take.filename);
      if (
        canonical === null ||
        prompt === undefined ||
        canonical.trackNumber !== prompt.trackNumber ||
        canonical.promptLane !== prompt.lane ||
        filenames.has(take.filename) ||
        (take.outputId !== null && outputIds.has(take.outputId))
      ) {
        return NextResponse.json(
          { error: 'Job outputs must be unique canonical takes for its prompt' },
          { status: 400 }
        );
      }
      filenames.add(take.filename);
      if (take.outputId !== null) outputIds.add(take.outputId);
    }
  }
  if (
    parsed.data.status === 'complete' &&
    (output === null ||
      output.takes.length === 0 ||
      output.takes.some(take => !take.downloaded || !take.uploaded))
  ) {
    return NextResponse.json(
      { error: 'Complete requires every actual take downloaded and uploaded' },
      { status: 409 }
    );
  }
  const updated = await prisma.providerJob.update({
    where: { id: job.id },
    data: {
      status: parsed.data.status,
      providerId: parsed.data.providerId ?? job.providerId,
      ...(output === null ? {} : { output: output as Prisma.InputJsonValue }),
    },
  });
  await prisma.generationRound.updateMany({
    where: { id, status: { not: 'ready-to-listen' } },
    data: {
      status:
        parsed.data.status === 'blocked'
          ? 'blocked'
          : parsed.data.status === 'accepted' || parsed.data.status === 'accepted-untracked'
            ? 'generating'
            : 'collecting-audio',
    },
  });
  return NextResponse.json(updated);
}
