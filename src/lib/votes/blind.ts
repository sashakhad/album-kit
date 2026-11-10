import 'server-only';

import { createHmac, randomInt } from 'node:crypto';

import type { Prisma } from '@/generated/prisma/client';
import type { AlbumTake, AlbumVersion } from '@/lib/album/types';
import { parseTakeLabel } from '@/lib/album/parse-filename';
import { albumKey } from '@/lib/owner/auth';
import { prisma } from '@/lib/prisma';
import type { VoteSnapshot } from '@/lib/votes/types';

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

export function blindLabel(index: number): string {
  const first = String.fromCharCode(65 + (index % 26));
  return index < 26 ? first : `${String.fromCharCode(64 + Math.floor(index / 26))}${first}`;
}

export function opaqueAudioId(round: number, filename: string): string {
  const key = albumKey();
  if (key === null) throw new Error('ALBUM_KEY is required for blind audio');
  return createHmac('sha256', key)
    .update(`blind-audio-v1:${round}:${filename}`)
    .digest('hex')
    .slice(0, 32);
}

async function orderFor(
  round: number,
  trackNumber: number,
  filenames: string[]
): Promise<string[]> {
  const where = { round_trackNumber: { round, trackNumber } };
  const row = await prisma.blindOrder.findUnique({ where });
  if (row === null) {
    const order = shuffled(filenames);
    const created = await prisma.blindOrder.upsert({
      where,
      create: { round, trackNumber, filenames: order },
      update: {},
    });
    return created.filenames as string[];
  }
  const saved = row.filenames as string[];
  const added = shuffled(filenames.filter(filename => !saved.includes(filename)));
  if (added.length === 0) return saved;
  const updated = [...saved, ...added];
  await prisma.blindOrder.update({ where, data: { filenames: updated as Prisma.InputJsonValue } });
  return updated;
}

export async function blindVersion(version: AlbumVersion, round: number): Promise<AlbumVersion> {
  const tracks = await Promise.all(
    version.tracks.map(async track => {
      const all = [...track.takes, ...(track.parkedTakes ?? [])];
      if (all.length === 0) return { ...track, prompt: null };
      const order = await orderFor(
        round,
        track.number,
        all.map(take => take.filename)
      );
      const map = new Map(order.map((filename, index) => [filename, blindLabel(index)]));
      const disguise = (take: AlbumTake): AlbumTake => {
        const alias = map.get(take.filename);
        if (alias === undefined) throw new Error('Missing blind alias');
        const token = opaqueAudioId(round, take.filename);
        return {
          label: alias,
          voteLabel: alias,
          versionSlug: take.versionSlug,
          filename: token,
          audioUrl: `/api/blind-audio/${round}/${token}`,
        };
      };
      const takes = track.takes.map(disguise);
      // The displayed order comes from the saved randomized filenames, not canonical letters.
      takes.sort((a, b) => labelIndex(a.label) - labelIndex(b.label));
      const parkedTakes = (track.parkedTakes ?? []).map(disguise);
      return {
        ...track,
        filename: takes[0]?.filename ?? null,
        audioUrl: takes[0]?.audioUrl ?? null,
        takes,
        parkedTakes,
        prompt: null,
      };
    })
  );
  return { ...version, tracks };
}

function labelIndex(label: string): number {
  if (label.length === 1) return label.charCodeAt(0) - 65;
  return (label.charCodeAt(0) - 64) * 26 + label.charCodeAt(1) - 65;
}

export async function realTakeForAlias(args: {
  round: number;
  trackNumber: number;
  versionSlug: string;
  alias: string;
  takes: AlbumTake[];
}): Promise<AlbumTake | null> {
  const row = await prisma.blindOrder.findUnique({
    where: { round_trackNumber: { round: args.round, trackNumber: args.trackNumber } },
  });
  const order = row?.filenames as string[] | undefined;
  if (order === undefined) return null;
  const filename = order.find((_, index) => blindLabel(index) === args.alias);
  return (
    args.takes.find(take => take.filename === filename && take.versionSlug === args.versionSlug) ??
    null
  );
}

export async function filenameForOpaqueId(round: number, token: string): Promise<string | null> {
  const rows = await prisma.blindOrder.findMany({ where: { round }, select: { filenames: true } });
  for (const row of rows) {
    for (const filename of row.filenames as string[]) {
      if (opaqueAudioId(round, filename) === token) return filename;
    }
  }
  return null;
}

export async function blindSnapshot(snapshot: VoteSnapshot): Promise<VoteSnapshot> {
  const rows = await prisma.blindOrder.findMany({ where: { round: snapshot.currentRound } });
  const aliases = new Map<string, string>();
  for (const row of rows) {
    (row.filenames as string[]).forEach((filename, index) => {
      const versionSlug = /^v\d+/.exec(filename)?.[0];
      const realLabel = parseTakeLabel(filename);
      if (versionSlug !== undefined && realLabel !== null)
        aliases.set(`${row.trackNumber}|${versionSlug}|${realLabel}`, blindLabel(index));
    });
  }
  const lookup = (track: number, version: string, label: string) =>
    aliases.get(`${track}|${version}|${label}`);
  const tallies: VoteSnapshot['tallies'] = {};
  for (const [trackText, versions] of Object.entries(snapshot.tallies)) {
    const track = Number(trackText);
    tallies[track] = {};
    for (const [version, labels] of Object.entries(versions)) {
      tallies[track][version] = {};
      for (const [label, value] of Object.entries(labels)) {
        const alias = lookup(track, version, label);
        if (alias !== undefined) tallies[track][version][alias] = value;
      }
    }
  }
  const mine: VoteSnapshot['mine'] = {};
  for (const [trackText, votes] of Object.entries(snapshot.mine)) {
    const track = Number(trackText);
    mine[track] = votes.flatMap(vote => {
      const alias = lookup(track, vote.versionSlug, vote.takeLabel);
      return alias === undefined ? [] : [{ ...vote, takeLabel: alias }];
    });
  }
  const downloads: VoteSnapshot['downloads'] = {};
  for (const [trackText, items] of Object.entries(snapshot.downloads)) {
    const track = Number(trackText);
    downloads[track] = items.flatMap(item => {
      const alias = lookup(track, item.versionSlug, item.takeLabel);
      return alias === undefined ? [] : [{ ...item, takeLabel: alias }];
    });
  }
  return { ...snapshot, tallies, mine, downloads };
}
