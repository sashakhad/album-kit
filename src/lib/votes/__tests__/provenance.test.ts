// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlbumVersion } from '@/lib/album/types';

const findMany = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: { takeProvenance: { findMany } } }));

import { withVisibleDetails } from '../provenance';

const first = 'v1-01-track-one-p1-takea.mp3';
const second = 'v1-01-track-one-p2-takeb.mp3';
const version: AlbumVersion = {
  slug: 'v1',
  folder: 'v1',
  title: 'Album',
  author: 'Artist',
  blurb: '',
  tracks: [
    {
      number: 1,
      title: 'Track One',
      kind: 'album',
      filename: first,
      audioUrl: '/first',
      prompt: null,
      takes: [
        {
          label: 'A',
          filename: first,
          audioUrl: '/first',
          versionSlug: 'v1',
          voteLabel: 'A',
          prompt: 'Revised sheet text',
        },
        {
          label: 'B',
          filename: second,
          audioUrl: '/second',
          versionSlug: 'v1',
          voteLabel: 'B',
          prompt: 'Sheet only text',
        },
      ],
    },
  ],
};

describe('visible take provenance', () => {
  beforeEach(() => findMany.mockReset());

  it('uses the recorded generation prompt for its exact file and labels sheet-only text', async () => {
    findMany.mockResolvedValue([
      {
        filename: first,
        style: 'Original generation text',
        writerHost: 'grok-bot',
        writerProvider: null,
        attribution: 'unverified',
        observedModel: null,
        sunoModel: 'v6',
        parentTakeFilename: null,
        promptInstructions: null,
      },
    ]);

    const visible = await withVisibleDetails(version);
    expect(findMany).toHaveBeenCalledWith({ where: { filename: { in: [first, second] } } });
    expect(visible.tracks[0]?.takes[0]).toMatchObject({
      filename: first,
      prompt: 'Original generation text',
      details: { style: 'Original generation text', promptSource: 'generation' },
    });
    expect(visible.tracks[0]?.takes[1]).toMatchObject({
      filename: second,
      prompt: 'Sheet only text',
      details: { promptSource: 'sheet' },
    });
  });
});
