import { promises as fs } from 'node:fs';

import { NextResponse } from 'next/server';

import { canUseBlob, listBlobTakeFilenames } from '@/lib/album/blob-audio';
import { localAudioDir } from '@/lib/album/paths';
import { requireOwner } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';
import type { RoundEstimate } from '@/lib/rounds/preflight';
import { checkRoundReadiness } from '@/lib/rounds/readiness';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireOwner(request);
  if (denied !== null) return denied;
  const { id } = await context.params;
  const round = await prisma.generationRound.findUnique({ where: { id }, include: { jobs: true } });
  if (round === null) return NextResponse.json({ error: 'Unknown round' }, { status: 404 });
  if (round.authorization === null)
    return NextResponse.json({ error: 'Round is not authorized' }, { status: 409 });
  const estimate = round.estimate as RoundEstimate;
  const filenames = round.jobs.flatMap(job => {
    const output = job.output as { takes?: Array<{ filename?: string }> } | null;
    return (
      output?.takes?.flatMap(take => (typeof take.filename === 'string' ? [take.filename] : [])) ??
      []
    );
  });
  const [provenance, storedFilenames] = await Promise.all([
    prisma.takeProvenance.findMany({ where: { filename: { in: filenames } } }),
    canUseBlob()
      ? listBlobTakeFilenames()
      : fs.readdir(localAudioDir()).catch(() => [] as string[]),
  ]);
  const audit = checkRoundReadiness({
    roundId: id,
    expectedJobs: estimate.generations,
    expectedOutputs: estimate.expectedOutputs,
    jobs: round.jobs,
    provenance,
    storedFilenames,
  });
  if (!audit.ready)
    return NextResponse.json({ error: 'Round is not ready', ...audit }, { status: 409 });
  const updated = await prisma.generationRound.update({
    where: { id },
    data: { status: 'ready-to-listen' },
  });
  await prisma.variationRequest.updateMany({
    where: { roundId: id },
    data: { status: 'ready' },
  });
  return NextResponse.json({
    round: updated,
    actualOutputs: audit.actualOutputs,
    expectedOutputs: estimate.expectedOutputs,
  });
}
