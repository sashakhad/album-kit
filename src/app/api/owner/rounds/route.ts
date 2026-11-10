import type { Prisma } from '@/generated/prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireOwner } from '@/lib/owner/auth';
import { estimateRound, promptAttribution, sunoCapabilitiesSchema } from '@/lib/rounds/preflight';
import { loadSettings } from '@/lib/settings/store';
import { prisma } from '@/lib/prisma';
import { loadAlbumConfig } from '@/lib/album/album-config';
import { styleProblems } from '@/lib/rounds/prompt-quality';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  tracks: z.number().int().positive(),
  prompts: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        trackNumber: z.number().int().min(1).max(99),
        lane: z.number().int().min(1).max(20),
        style: z.string().min(1).max(900),
        writerHost: z.enum(['grok-bot', 'cursor']),
        writerProvider: z.string().nullable().optional(),
        requestedModel: z.string().nullable().optional(),
        observedModel: z.string().nullable().optional(),
        executionId: z.string().nullable().optional(),
        revision: z.number().int().positive(),
      })
    )
    .min(1),
  capabilities: sunoCapabilitiesSchema,
  externalSpendEstimateUsd: z.number().min(0).optional(),
  hostingChargeEstimateUsd: z.number().min(0),
  hostingEligibilityVerified: z.literal(true),
});

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const rounds = await prisma.generationRound.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { jobs: true },
  });
  return NextResponse.json(rounds);
}

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const raw: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const checkedAt = Date.parse(parsed.data.capabilities.checkedAt);
  if (checkedAt > Date.now() + 5 * 60_000 || Date.now() - checkedAt > 60 * 60_000) {
    return NextResponse.json(
      { error: 'Refresh Suno models, credits, and download allowance before creating a round' },
      { status: 409 }
    );
  }
  const [settings, album] = await Promise.all([loadSettings(), loadAlbumConfig()]);
  if (
    settings.promptWriter !== 'cursor' &&
    parsed.data.prompts.some(prompt => prompt.writerHost === 'cursor')
  ) {
    return NextResponse.json(
      { error: 'Cursor prompt work requires the Studio writer setting and a verified handoff' },
      { status: 409 }
    );
  }
  const estimate = estimateRound({ ...parsed.data, settings });
  const ids = new Set(parsed.data.prompts.map(prompt => prompt.id));
  const trackNumbers = new Set(parsed.data.prompts.map(prompt => prompt.trackNumber));
  const slots = new Set(parsed.data.prompts.map(prompt => `${prompt.trackNumber}:${prompt.lane}`));
  if (
    parsed.data.prompts.length !== estimate.prompts ||
    ids.size !== estimate.prompts ||
    trackNumbers.size !== parsed.data.tracks ||
    slots.size !== estimate.prompts ||
    parsed.data.prompts.some(prompt => prompt.lane > settings.promptVariations)
  ) {
    return NextResponse.json(
      { error: 'Prompt slots must match the exact track and variation count' },
      { status: 400 }
    );
  }
  for (const prompt of parsed.data.prompts) {
    const track = album.tracks.find(item => item.number === prompt.trackNumber);
    if (track === undefined)
      return NextResponse.json({ error: `Unknown track ${prompt.trackNumber}` }, { status: 400 });
    const problems = styleProblems(prompt.style, track.title);
    if (problems.length > 0)
      return NextResponse.json({ error: { promptId: prompt.id, problems } }, { status: 400 });
  }
  const prompts = parsed.data.prompts.map(prompt => ({
    trackNumber: prompt.trackNumber,
    lane: prompt.lane,
    style: prompt.style,
    ...promptAttribution({
      id: prompt.id,
      host: prompt.writerHost,
      provider: prompt.writerProvider ?? null,
      requestedModel: prompt.requestedModel ?? null,
      observedModel: prompt.observedModel ?? null,
      executionId: prompt.executionId ?? null,
      revision: prompt.revision,
    }),
  }));
  const round = await prisma.generationRound.create({
    data: {
      snapshot: {
        settings,
        capabilities: parsed.data.capabilities,
        resolvedSunoModel: estimate.sunoModel,
        prompts,
      } as Prisma.InputJsonValue,
      estimate: estimate as Prisma.InputJsonValue,
      status: estimate.blockers.length > 0 ? 'blocked' : 'preparing',
    },
  });
  return NextResponse.json({ round, estimate }, { status: 201 });
}
