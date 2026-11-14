import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { getSet } from '@/lib/album/load-album';
import { parseCanonicalTake } from '@/lib/album/parse-filename';
import { OWNER_VISITOR_ID, requireOwner } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';
import { loadSettings } from '@/lib/settings/store';
import { opaqueAudioId, filenameForOpaqueId } from '@/lib/votes/blind';
import { getVoteSnapshot } from '@/lib/votes/board';
import { isBlindForSnapshot } from '@/lib/votes/exposure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z
  .object({
    id: z.uuid(),
    trackNumber: z.number().int().min(1).max(99),
    parentTakeFilename: z.string().min(1).optional(),
    parentTakeToken: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .optional(),
    sourceRound: z.number().int().positive().optional(),
    requestedTakes: z.number().int().min(1).max(20),
    instructions: z.string().trim().max(1000).default(''),
  })
  .refine(
    input =>
      (input.parentTakeFilename === undefined) !== (input.parentTakeToken === undefined) &&
      (input.parentTakeToken === undefined) === (input.sourceRound === undefined)
  );

type RequestInput = z.infer<typeof requestSchema>;

function presentRequest<T extends { parentTakeFilename: string }>(row: T, sourceRound?: number) {
  if (sourceRound === undefined) return row;
  const { parentTakeFilename, ...rest } = row;
  return {
    ...rest,
    parentTakeToken: opaqueAudioId(sourceRound, parentTakeFilename),
    sourceRound,
  };
}

async function blindOwnerRound(): Promise<number | null> {
  const settings = await loadSettings();
  if (settings.listeningDetails === 'visible') return null;
  const votes = await getVoteSnapshot(OWNER_VISITOR_ID);
  return (await isBlindForSnapshot(OWNER_VISITOR_ID, settings.listeningDetails, votes))
    ? votes.currentRound
    : null;
}

function matchesParent(row: { parentTakeFilename: string }, input: RequestInput): boolean {
  return input.parentTakeFilename !== undefined
    ? row.parentTakeFilename === input.parentTakeFilename
    : opaqueAudioId(input.sourceRound!, row.parentTakeFilename) === input.parentTakeToken;
}

async function resolveParent(input: RequestInput): Promise<string | null> {
  return (
    input.parentTakeFilename ?? filenameForOpaqueId(input.sourceRound!, input.parentTakeToken!)
  );
}

function savedInput(input: RequestInput, parentTakeFilename: string) {
  return {
    id: input.id,
    trackNumber: input.trackNumber,
    parentTakeFilename,
    requestedTakes: input.requestedTakes,
    instructions: input.instructions,
  };
}

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const id = new URL(request.url).searchParams.get('id');
  const roundText = new URL(request.url).searchParams.get('sourceRound');
  const round = roundText === null ? null : z.coerce.number().int().positive().safeParse(roundText);
  if (round !== null && !round.success)
    return NextResponse.json({ error: 'Invalid source round' }, { status: 400 });
  if (id !== null) {
    if (!z.uuid().safeParse(id).success)
      return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 });
    const found = await prisma.variationRequest.findUnique({ where: { id } });
    return found === null
      ? NextResponse.json({ error: 'Request not found' }, { status: 404 })
      : NextResponse.json(
          presentRequest(found, round?.data ?? (await blindOwnerRound()) ?? undefined)
        );
  }
  const requests = await prisma.variationRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const blindRound = await blindOwnerRound();
  return NextResponse.json(requests.map(row => presentRequest(row, blindRound ?? undefined)));
}

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const raw: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Choose 1–20 takes and a valid parent take' },
      { status: 400 }
    );

  const input = parsed.data;
  const existing = await prisma.variationRequest.findUnique({ where: { id: input.id } });
  if (existing !== null) {
    if (existing.status === 'canceled')
      return NextResponse.json({ error: 'This request was canceled' }, { status: 409 });
    const same =
      existing.trackNumber === input.trackNumber &&
      matchesParent(existing, input) &&
      existing.requestedTakes === input.requestedTakes &&
      existing.instructions === input.instructions;
    return same
      ? NextResponse.json(presentRequest(existing, input.sourceRound))
      : NextResponse.json(
          { error: 'Request ID already belongs to another variation' },
          { status: 409 }
        );
  }

  const parentTakeFilename = await resolveParent(input);
  const parent = parentTakeFilename === null ? null : parseCanonicalTake(parentTakeFilename);
  if (parentTakeFilename === null || parent === null || parent.trackNumber !== input.trackNumber)
    return NextResponse.json(
      { error: 'Parent take does not match the selected track' },
      { status: 400 }
    );

  const [album, set] = await Promise.all([loadAlbumConfig(), getSet(parent.setId)]);
  const track = album.tracks.find(item => item.number === input.trackNumber);
  if (
    track === undefined ||
    track.slug !== parent.slug ||
    set?.tracks
      .find(item => item.number === input.trackNumber)
      ?.takes.some(take => take.filename === parentTakeFilename) !== true
  ) {
    return NextResponse.json(
      { error: 'Selected take is not available for this track' },
      { status: 404 }
    );
  }

  const created = await prisma.variationRequest.upsert({
    where: { id: input.id },
    create: savedInput(input, parentTakeFilename),
    update: {},
  });
  if (
    created.status === 'canceled' ||
    created.trackNumber !== input.trackNumber ||
    !matchesParent(created, input) ||
    created.requestedTakes !== input.requestedTakes ||
    created.instructions !== input.instructions
  ) {
    return NextResponse.json(
      { error: 'Request ID already belongs to another variation' },
      { status: 409 }
    );
  }
  return NextResponse.json(
    {
      request: presentRequest(created, input.sourceRound),
      next:
        input.sourceRound === undefined
          ? 'The bot must write the revised prompt, check current Suno credits and downloads, and show an exact estimate for your approval before generation.'
          : 'Request saved without revealing the take. Once this pass is revealed, the bot can prepare its prompt and cost estimate for your approval. No credits were used.',
    },
    { status: 201 }
  );
}

/** A canceled ID is kept as a tombstone so a delayed retry cannot create it later. */
export async function DELETE(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const raw: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid variation request' }, { status: 400 });
  const input = parsed.data;
  const existing = await prisma.variationRequest.findUnique({ where: { id: input.id } });
  const parentTakeFilename = existing?.parentTakeFilename ?? (await resolveParent(input));
  if (parentTakeFilename === null)
    return NextResponse.json({ error: 'Invalid blind take token' }, { status: 400 });
  const row = await prisma.variationRequest.upsert({
    where: { id: input.id },
    create: { ...savedInput(input, parentTakeFilename), status: 'canceled' },
    update: {},
  });
  if (
    row.trackNumber !== input.trackNumber ||
    !matchesParent(row, input) ||
    row.requestedTakes !== input.requestedTakes ||
    row.instructions !== input.instructions
  )
    return NextResponse.json({ error: 'Request ID belongs to another variation' }, { status: 409 });
  if (row.status === 'canceled') return NextResponse.json(presentRequest(row, input.sourceRound));
  const changed = await prisma.variationRequest.updateMany({
    where: { id: input.id, status: 'requested', roundId: null },
    data: { status: 'canceled' },
  });
  if (changed.count === 0)
    return NextResponse.json(
      { error: 'This request is already planned and cannot be changed here' },
      { status: 409 }
    );
  return NextResponse.json(presentRequest({ ...row, status: 'canceled' }, input.sourceRound));
}
