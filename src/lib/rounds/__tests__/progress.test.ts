import { describe, expect, it } from 'vitest';

import { idleProgress, progressBannerLine, summarizeProgress } from '@/lib/rounds/progress';

const clip = 'clip-1';
const streamUrl = `https://cdn1.suno.ai/${clip}.mp4`;

function summarize(
  overrides: Partial<Parameters<typeof summarizeProgress>[0]> = {}
): ReturnType<typeof summarizeProgress> {
  return summarizeProgress({
    roundId: 'round-1',
    roundNumber: 1,
    status: 'generating',
    jobsExpected: 90,
    takesExpected: 180,
    generationsPerPrompt: 1,
    outputsPerGeneration: 2,
    prompts: [
      { id: 'p1', trackNumber: 1 },
      { id: 'p2', trackNumber: 1 },
      { id: 'p3', trackNumber: 2 },
    ],
    jobs: [],
    titles: new Map([
      [1, 'First'],
      [2, 'Second'],
    ]),
    ...overrides,
  });
}

describe('album progress', () => {
  it('says when no round exists and hides that from the banner', () => {
    const progress = idleProgress();
    expect(progress.line).toBe('No generation round yet.');
    expect(progressBannerLine(progress)).toBeNull();
  });

  it('counts finished generations and collected takes', () => {
    const progress = summarize({
      jobs: [
        {
          promptId: 'p1',
          status: 'complete',
          output: {
            takes: [
              {
                filename: 'v1-01-first-p1-takea.mp3',
                outputId: clip,
                clipId: clip,
                streamUrl,
                downloaded: false,
                uploaded: false,
              },
              {
                filename: 'v1-01-first-p1-takeb.mp3',
                outputId: 'clip-2',
                clipId: 'clip-2',
                streamUrl: 'https://cdn1.suno.ai/clip-2.mp4',
                downloaded: false,
                uploaded: false,
              },
            ],
          },
        },
        { promptId: 'p2', status: 'accepted', output: null },
      ],
    });

    expect(progress.phase).toBe('generating');
    expect(progress.jobsFinished).toBe(1);
    expect(progress.takesReady).toBe(2);
    expect(progress.line).toBe('Round 1: 1/90 done, 2 of 180 takes ready.');
    expect(progress.tracks).toEqual([
      { trackNumber: 1, title: 'First', ready: 2, expected: 4 },
      { trackNumber: 2, title: 'Second', ready: 0, expected: 2 },
    ]);
    expect(progressBannerLine(progress)).toBe(progress.line);
  });

  it('stays quiet once the round is ready to listen', () => {
    const progress = summarize({
      status: 'ready-to-listen',
      jobsExpected: 1,
      takesExpected: 2,
      jobs: [
        {
          promptId: 'p1',
          status: 'complete',
          output: {
            takes: [
              {
                filename: 'v1-01-first-p1-takea.mp3',
                outputId: clip,
                downloaded: true,
                uploaded: true,
              },
            ],
          },
        },
      ],
    });
    expect(progress.phase).toBe('ready');
    expect(progressBannerLine(progress)).toBeNull();
    expect(progress.line).toBe('Round 1 is ready. 1 of 2 takes ready.');
  });

  it('names preparing and blocked rounds', () => {
    expect(summarize({ status: 'preparing' }).line).toBe('Round 1: preparing the estimate.');
    expect(summarize({ status: 'blocked' }).phase).toBe('blocked');
  });
});
