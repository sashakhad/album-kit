import 'server-only';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { listSets } from '@/lib/album/load-album';
import { prisma } from '@/lib/prisma';
import { loadSettings } from '@/lib/settings/store';
import {
  idleProgress,
  liveTrackLinks,
  summarizeProgress,
  type AlbumProgress,
  type LiveTrackLink,
  type ProgressPrompt,
} from '@/lib/rounds/progress';

export type AlbumProgressReport = AlbumProgress & {
  liveTracks: LiveTrackLink[];
};

export async function loadAlbumProgress(): Promise<AlbumProgressReport> {
  const progress = await loadRoundProgress();
  return { ...progress, liveTracks: await loadLiveTracks(progress) };
}

async function loadRoundProgress(): Promise<AlbumProgress> {
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.length === 0) {
    return idleProgress();
  }

  try {
    const [rounds, config] = await Promise.all([
      prisma.generationRound.findMany({
        orderBy: { createdAt: 'asc' },
        include: { jobs: { select: { promptId: true, status: true, output: true } } },
      }),
      loadAlbumConfig().catch(() => null),
    ]);
    if (rounds.length === 0) {
      return idleProgress();
    }

    const activeIndex = rounds.findIndex(round => round.status !== 'ready-to-listen');
    const index = activeIndex < 0 ? rounds.length - 1 : activeIndex;
    const round = rounds[index];
    if (round === undefined) {
      return idleProgress();
    }

    const estimate = readEstimate(round.estimate);
    const snapshot = readSnapshot(round.snapshot);
    const titles = new Map<number, string>();
    for (const track of config?.tracks ?? []) {
      titles.set(track.number, track.title);
    }
    const outputsPerGeneration =
      estimate.generations > 0 ? Math.round(estimate.expectedOutputs / estimate.generations) : 0;

    return summarizeProgress({
      roundId: round.id,
      roundNumber: index + 1,
      status: round.status,
      jobsExpected: estimate.generations,
      takesExpected: estimate.expectedOutputs,
      generationsPerPrompt: snapshot.generationsPerPrompt,
      outputsPerGeneration,
      prompts: snapshot.prompts,
      jobs: round.jobs,
      titles,
    });
  } catch {
    return idleProgress();
  }
}

async function loadLiveTracks(progress: AlbumProgress): Promise<LiveTrackLink[]> {
  try {
    const [versions, settings] = await Promise.all([listSets(), loadSettings().catch(() => null)]);
    const playableNumbers: number[] = [];
    for (const version of versions) {
      for (const track of version.tracks) {
        if (track.takes.length === 0 || track.audioUrl === null) {
          continue;
        }
        if (!playableNumbers.includes(track.number)) {
          playableNumbers.push(track.number);
        }
      }
    }
    return liveTrackLinks({
      tracks: progress.tracks,
      playableNumbers,
      listenerVoting: settings?.listenerVoting === true,
    });
  } catch {
    return [];
  }
}

function readEstimate(value: unknown): { generations: number; expectedOutputs: number } {
  if (!isRecord(value)) {
    return { generations: 0, expectedOutputs: 0 };
  }
  return {
    generations: numberField(value.generations),
    expectedOutputs: numberField(value.expectedOutputs),
  };
}

function readSnapshot(value: unknown): {
  generationsPerPrompt: number;
  prompts: ProgressPrompt[];
} {
  if (!isRecord(value)) {
    return { generationsPerPrompt: 1, prompts: [] };
  }
  const settings = isRecord(value.settings) ? value.settings : {};
  const generationsPerPrompt = numberField(settings.generationsPerPrompt);
  const prompts: ProgressPrompt[] = [];
  if (Array.isArray(value.prompts)) {
    for (const prompt of value.prompts) {
      if (!isRecord(prompt) || typeof prompt.id !== 'string') {
        continue;
      }
      const trackNumber = numberField(prompt.trackNumber);
      if (trackNumber < 1) {
        continue;
      }
      prompts.push({ id: prompt.id, trackNumber });
    }
  }
  return {
    generationsPerPrompt: generationsPerPrompt > 0 ? generationsPerPrompt : 1,
    prompts,
  };
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
