import { parseTrackNumber } from '@/lib/album/parse-filename';
import { takeIsCollected } from '@/lib/album/stream-url';
import { formatNumberExact } from '@/lib/formatters';
import { jobOutputSchema } from '@/lib/rounds/job-output';

export type ProgressPhase =
  'idle' | 'preparing' | 'generating' | 'collecting' | 'ready' | 'blocked';

export type ProgressTrack = {
  trackNumber: number;
  title: string;
  ready: number;
  expected: number;
};

export type AlbumProgress = {
  phase: ProgressPhase;
  roundId: string | null;
  roundNumber: number | null;
  jobsExpected: number;
  jobsFinished: number;
  takesExpected: number;
  takesReady: number;
  tracks: ProgressTrack[];
  line: string;
};

export type ProgressPrompt = {
  id: string;
  trackNumber: number;
};

export type ProgressJob = {
  promptId: string;
  status: string;
  output: unknown;
};

export function idleProgress(): AlbumProgress {
  return {
    phase: 'idle',
    roundId: null,
    roundNumber: null,
    jobsExpected: 0,
    jobsFinished: 0,
    takesExpected: 0,
    takesReady: 0,
    tracks: [],
    line: 'No generation round yet.',
  };
}

export function summarizeProgress(args: {
  roundId: string | null;
  roundNumber: number | null;
  status: string | null;
  jobsExpected: number;
  takesExpected: number;
  generationsPerPrompt: number;
  outputsPerGeneration: number;
  prompts: readonly ProgressPrompt[];
  jobs: readonly ProgressJob[];
  titles: ReadonlyMap<number, string>;
}): AlbumProgress {
  const jobsExpected = Math.max(0, args.jobsExpected);
  const takesExpected = Math.max(0, args.takesExpected);
  const jobsFinished = countFinishedJobs(args.jobs);
  const takesReady = countReadyTakes(args.jobs);
  const phase = progressPhase({
    roundId: args.roundId,
    status: args.status,
    jobsExpected,
    jobsFinished,
    takesExpected,
    takesReady,
  });
  const tracks = trackProgress({
    prompts: args.prompts,
    jobs: args.jobs,
    titles: args.titles,
    generationsPerPrompt: Math.max(0, args.generationsPerPrompt),
    outputsPerGeneration: Math.max(0, args.outputsPerGeneration),
  });
  const progress: AlbumProgress = {
    phase,
    roundId: args.roundId,
    roundNumber: args.roundNumber,
    jobsExpected,
    jobsFinished,
    takesExpected,
    takesReady,
    tracks,
    line: '',
  };
  progress.line = progressLine(progress);
  return progress;
}

/** Vote and Listen show this while work is still going. A finished round stays quiet. */
export function progressBannerLine(progress: AlbumProgress): string | null {
  if (progress.phase === 'idle' || progress.phase === 'ready') {
    return null;
  }
  return progress.line;
}

function progressPhase(args: {
  roundId: string | null;
  status: string | null;
  jobsExpected: number;
  jobsFinished: number;
  takesExpected: number;
  takesReady: number;
}): ProgressPhase {
  if (args.roundId === null || args.status === null) {
    return 'idle';
  }
  if (args.status === 'blocked') {
    return 'blocked';
  }
  if (args.status === 'ready-to-listen') {
    return 'ready';
  }
  if (args.status === 'preparing') {
    return 'preparing';
  }
  if (args.jobsFinished < args.jobsExpected) {
    return 'generating';
  }
  if (args.takesReady < args.takesExpected) {
    return 'collecting';
  }
  return 'collecting';
}

function progressLine(progress: AlbumProgress): string {
  const round =
    progress.roundNumber === null
      ? 'This round'
      : `Round ${formatNumberExact(progress.roundNumber)}`;
  if (progress.phase === 'idle') {
    return 'No generation round yet.';
  }
  if (progress.phase === 'preparing') {
    return `${round}: preparing the estimate.`;
  }
  if (progress.phase === 'blocked') {
    return `${round}: blocked before generation.`;
  }
  if (progress.phase === 'ready') {
    return `${round} is ready. ${formatNumberExact(progress.takesReady)} of ${formatNumberExact(progress.takesExpected)} takes ready.`;
  }
  return `${round}: ${formatNumberExact(progress.jobsFinished)}/${formatNumberExact(progress.jobsExpected)} done, ${formatNumberExact(progress.takesReady)} of ${formatNumberExact(progress.takesExpected)} takes ready.`;
}

function countFinishedJobs(jobs: readonly ProgressJob[]): number {
  let finished = 0;
  for (const job of jobs) {
    if (job.status === 'complete') {
      finished += 1;
    }
  }
  return finished;
}

function countReadyTakes(jobs: readonly ProgressJob[]): number {
  let ready = 0;
  for (const job of jobs) {
    const output = jobOutputSchema.safeParse(job.output);
    if (!output.success) {
      continue;
    }
    for (const take of output.data.takes) {
      if (takeIsCollected(take)) {
        ready += 1;
      }
    }
  }
  return ready;
}

function trackProgress(args: {
  prompts: readonly ProgressPrompt[];
  jobs: readonly ProgressJob[];
  titles: ReadonlyMap<number, string>;
  generationsPerPrompt: number;
  outputsPerGeneration: number;
}): ProgressTrack[] {
  const expectedByTrack = new Map<number, number>();
  const perPrompt = args.generationsPerPrompt * args.outputsPerGeneration;
  for (const prompt of args.prompts) {
    expectedByTrack.set(
      prompt.trackNumber,
      (expectedByTrack.get(prompt.trackNumber) ?? 0) + perPrompt
    );
  }

  const readyByTrack = new Map<number, number>();
  for (const job of args.jobs) {
    const output = jobOutputSchema.safeParse(job.output);
    if (!output.success) {
      continue;
    }
    for (const take of output.data.takes) {
      if (!takeIsCollected(take)) {
        continue;
      }
      const trackNumber = parseTrackNumber(take.filename);
      if (trackNumber === null) {
        continue;
      }
      readyByTrack.set(trackNumber, (readyByTrack.get(trackNumber) ?? 0) + 1);
    }
  }

  const numbers = new Set<number>([...expectedByTrack.keys(), ...readyByTrack.keys()]);
  const tracks: ProgressTrack[] = [];
  for (const trackNumber of [...numbers].sort((left, right) => left - right)) {
    const title = args.titles.get(trackNumber);
    tracks.push({
      trackNumber,
      title: title === undefined || title.length === 0 ? `Track ${trackNumber}` : title,
      ready: readyByTrack.get(trackNumber) ?? 0,
      expected: expectedByTrack.get(trackNumber) ?? 0,
    });
  }
  return tracks;
}
