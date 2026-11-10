import { jobOutputSchema } from '@/lib/rounds/job-output';

type JobRecord = {
  promptId: string;
  status: string;
  output: unknown;
};

type ProvenanceRecord = {
  filename: string;
  promptId: string;
  roundId: string;
  outputId: string | null;
};

export function checkRoundReadiness(args: {
  roundId: string;
  expectedJobs: number;
  expectedOutputs: number;
  jobs: JobRecord[];
  provenance: ProvenanceRecord[];
  storedFilenames: string[];
}): { ready: boolean; problems: string[]; actualOutputs: number } {
  const problems: string[] = [];
  if (args.jobs.length !== args.expectedJobs)
    problems.push(`Expected ${args.expectedJobs} generation jobs; found ${args.jobs.length}.`);
  const stored = new Set(args.storedFilenames);
  const records = new Map(args.provenance.map(record => [record.filename, record]));
  const seen = new Set<string>();
  let actualOutputs = 0;
  for (const job of args.jobs) {
    if (job.status !== 'complete') {
      problems.push(`Prompt ${job.promptId} has an unfinished generation job.`);
      continue;
    }
    const output = jobOutputSchema.safeParse(job.output);
    if (!output.success || output.data.takes.length === 0) {
      problems.push(`Prompt ${job.promptId} has no validated output record.`);
      continue;
    }
    for (const take of output.data.takes) {
      actualOutputs++;
      if (seen.has(take.filename)) problems.push(`${take.filename} appears in more than one job.`);
      seen.add(take.filename);
      if (!take.downloaded || !take.uploaded)
        problems.push(`${take.filename} has not been downloaded and uploaded.`);
      if (!stored.has(take.filename))
        problems.push(`${take.filename} is missing from audio storage.`);
      const record = records.get(take.filename);
      if (
        record === undefined ||
        record.promptId !== job.promptId ||
        record.roundId !== args.roundId ||
        record.outputId !== take.outputId
      )
        problems.push(`${take.filename} has no matching take provenance.`);
    }
  }
  if (actualOutputs > args.expectedOutputs)
    problems.push(
      `Found ${actualOutputs} outputs; the round allowance covered ${args.expectedOutputs}.`
    );
  return { ready: problems.length === 0, problems, actualOutputs };
}
