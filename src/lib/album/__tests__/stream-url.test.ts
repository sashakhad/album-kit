import { describe, expect, it, vi } from 'vitest';

import { buildVersion } from '@/lib/album/build-version';
import { CONTENT_SECURITY_POLICY } from '@/lib/album/content-security';
import {
  PUBLISH_CLIP_PROBLEM,
  SUNO_CLIP_ENDPOINT,
  UNPLAYABLE_PUBLIC_CLIP_PROBLEM,
  UNREADABLE_CLIP_PROBLEM,
  resolveClipStreams,
} from '@/lib/album/clip-stream';
import {
  filenamesForPlayback,
  isPlayableStream,
  isVideoStream,
  listenerAudioUrl,
  playbackAudioUrl,
  refreshStoredStreams,
  streamLinkStatus,
  takeIsCollected,
  takeStreamProblem,
} from '@/lib/album/stream-url';

const clipId = 'clip-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const streamUrl = `https://cdn1.suno.ai/${clipId}.mp3`;
const videoUrl = `https://cdn1.suno.ai/${clipId}.mp4`;
const filename = 'v1-01-track-one-p1-takea.mp3';

describe('stream playback', () => {
  it('plays a stored Suno MP3 and falls back to an uploaded file', () => {
    expect(
      playbackAudioUrl({
        streamUrl,
        clipId,
        fileUrl: '/api/audio/v1/v1-01-track-one-p1-takea.mp3',
      })
    ).toBe(streamUrl);
    expect(
      playbackAudioUrl({
        streamUrl: null,
        clipId,
        fileUrl: '/api/audio/v1/v1-01-track-one-p1-takea.mp3',
      })
    ).toBe('/api/audio/v1/v1-01-track-one-p1-takea.mp3');
    expect(
      playbackAudioUrl({
        streamUrl: 'https://cdn1.suno.ai/someone-else.mp3',
        clipId,
        fileUrl: '/api/audio/v1/file.mp3',
      })
    ).toBe('/api/audio/v1/file.mp3');
    expect(playbackAudioUrl({ streamUrl: null, clipId: null, fileUrl: null })).toBeNull();
  });

  it('keeps a direct stream on Vote and Listen instead of the file proxy', () => {
    expect(listenerAudioUrl(streamUrl, '/api/blind-audio/1/token')).toBe(streamUrl);
    expect(listenerAudioUrl(streamUrl, '/api/listen-audio/token')).toBe(streamUrl);
    expect(listenerAudioUrl('/api/audio/v1/file.mp3', '/api/listen-audio/token')).toBe(
      '/api/listen-audio/token'
    );
  });

  it('builds a take list from stream URLs, including a take with no uploaded file', () => {
    const other = 'v1-02-track-two-p2-takeb.mp3';
    const otherClip = 'clip-bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee';
    const files = filenamesForPlayback(['v1-01-track-one-p1-takea.mp3'], [{ filename: other }]);
    const version = buildVersion({
      folder: 'v1',
      meta: { title: 'Bubu', author: 'Bubu', blurb: '', publicSlug: 'v1' },
      audioFiles: files,
      prompts: new Map(),
      tracklist: [
        { number: 1, title: 'Track One' },
        { number: 2, title: 'Track Two' },
      ],
      streams: new Map([
        [filename, { filename, clipId, streamUrl }],
        [
          other,
          {
            filename: other,
            clipId: otherClip,
            streamUrl: `https://cdn2.suno.ai/${otherClip}.mp3`,
          },
        ],
      ]),
    });

    expect(version.tracks[0]?.takes[0]?.audioUrl).toBe(streamUrl);
    expect(version.tracks[1]?.takes.map(take => take.audioUrl)).toEqual([
      `https://cdn2.suno.ai/${otherClip}.mp3`,
    ]);
  });

  it('allows Suno CDN MP3 and public MP4 in the media policy', () => {
    expect(CONTENT_SECURITY_POLICY).toContain('https://*.suno.ai');
    expect(CONTENT_SECURITY_POLICY).toContain("media-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('studio-api.prod.suno.com');
    expect(isPlayableStream(streamUrl, clipId)).toBe(true);
    expect(isPlayableStream(videoUrl, clipId)).toBe(true);
    expect(isPlayableStream(`https://cdn12.suno.ai/${clipId}.mp4`, clipId)).toBe(true);
    expect(isPlayableStream(`https://cdn1.suno.ai/${clipId}.m4a`, clipId)).toBe(false);
    expect(isPlayableStream(`${videoUrl}?token=1`, clipId)).toBe(false);
    expect(isPlayableStream('https://d2lwuy8qc234o3.cloudfront.net/1/clip/x.m4a', clipId)).toBe(
      false
    );
    expect(isPlayableStream('http://cdn1.suno.ai/clip.mp3', 'clip')).toBe(false);
    expect(isPlayableStream('https://evil.example/clip.mp3', 'clip')).toBe(false);
    expect(isVideoStream(videoUrl)).toBe(true);
    expect(isVideoStream(streamUrl)).toBe(false);
    expect(
      playbackAudioUrl({ streamUrl: videoUrl, clipId, fileUrl: '/api/audio/v1/file.mp3' })
    ).toBe(videoUrl);
  });
});

describe('stream refresh', () => {
  it('fills a missing URL and replaces a stale one from library clip metadata', () => {
    const moved = `https://cdn2.suno.ai/${clipId}.mp3`;
    const missing = 'v1-01-track-one-p1-takeb.mp3';
    const current = 'v1-01-track-one-p1-takec.mp3';
    const currentClip = 'clip-cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee';
    const updates = refreshStoredStreams(
      [
        { filename, clipId, streamUrl: 'https://cdn1.suno.ai/not-this-clip.mp3' },
        { filename: missing, clipId: null, outputId: clipId, streamUrl: null },
        {
          filename: current,
          clipId: currentClip,
          streamUrl: `https://cdn1.suno.ai/${currentClip}.mp3`,
        },
        { filename: 'v1-01-track-one-p1-taked.mp3', clipId: 'unknown', streamUrl: null },
      ],
      [
        { id: clipId, audio_url: moved },
        { id: currentClip, audio_url: `https://cdn1.suno.ai/${currentClip}.mp3` },
        { id: 'page-only', audio_url: 'https://suno.com/song/page-only' },
      ]
    );

    expect(updates).toEqual([
      { filename, clipId, streamUrl: moved },
      { filename: missing, clipId, streamUrl: moved },
    ]);
    expect(streamLinkStatus({ clipId, streamUrl: null })).toBe('missing');
    expect(streamLinkStatus({ clipId, streamUrl: 'https://cdn1.suno.ai/other.mp3' })).toBe('stale');
    expect(streamLinkStatus({ clipId, streamUrl })).toBe('ready');
  });

  it('treats a valid stream as collected without a download', () => {
    expect(
      takeIsCollected({
        outputId: clipId,
        clipId,
        streamUrl,
        downloaded: false,
        uploaded: false,
      })
    ).toBe(true);
    expect(
      takeIsCollected({
        outputId: 'output-1',
        streamUrl: null,
        downloaded: true,
        uploaded: true,
      })
    ).toBe(true);
    expect(
      takeIsCollected({
        outputId: clipId,
        streamUrl: null,
        downloaded: false,
        uploaded: false,
      })
    ).toBe(false);
    expect(takeStreamProblem({ outputId: clipId, clipId: 'other', streamUrl })).toBe(
      'Clip id and output id must be the same Suno clip'
    );
    expect(takeStreamProblem({ outputId: clipId, streamUrl: 'https://evil.example/x.mp3' })).toBe(
      'Stream URL must be the Suno MP3 or MP4 for that clip'
    );
    expect(takeStreamProblem({ outputId: clipId, clipId, streamUrl: videoUrl })).toBeNull();
    expect(
      takeIsCollected({
        outputId: clipId,
        clipId,
        streamUrl: videoUrl,
        downloaded: false,
        uploaded: false,
      })
    ).toBe(true);
  });

  it('stores a public clip MP4 when no playable audio_url was given', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        is_public: true,
        audio_url: 'https://studio-api.prod.suno.com/api/forbidden',
        video_url: videoUrl,
        media_urls: [{ url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/x.m4a' }],
      })
    );
    const resolved = await resolveClipStreams(
      [{ id: clipId, audio_url: 'https://studio-api.prod.suno.com/api/forbidden' }, { id: clipId }],
      fetchImpl
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(`${SUNO_CLIP_ENDPOINT}${clipId}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    expect(resolved.problems).toEqual([]);
    expect(resolved.clips).toEqual([{ id: clipId, audio_url: videoUrl }]);
    expect(PUBLISH_CLIP_PROBLEM).toBe('publish the clip on Suno');

    const kept = await resolveClipStreams(
      [{ id: clipId, audio_url: streamUrl }],
      vi.fn<typeof fetch>()
    );
    expect(kept.clips).toEqual([{ id: clipId, audio_url: streamUrl }]);
  });

  it('tells the owner to publish a clip that is not public', async () => {
    const privateClip = vi.fn(async () => Response.json({ is_public: false, video_url: videoUrl }));
    const hidden = await resolveClipStreams([{ id: clipId }], privateClip);
    expect(hidden.clips).toEqual([]);
    expect(hidden.problems).toEqual([{ clipId, problem: PUBLISH_CLIP_PROBLEM }]);

    const missing = await resolveClipStreams(
      [{ id: clipId }],
      vi.fn(async () => new Response('{"detail":"Not found."}', { status: 404 }))
    );
    expect(missing.problems).toEqual([{ clipId, problem: PUBLISH_CLIP_PROBLEM }]);

    const down = await resolveClipStreams(
      [{ id: clipId }],
      vi.fn(async () => {
        throw new Error('offline');
      })
    );
    expect(down.problems).toEqual([{ clipId, problem: UNREADABLE_CLIP_PROBLEM }]);

    const bare = await resolveClipStreams(
      [{ id: clipId }],
      vi.fn(async () => Response.json({ is_public: true, audio_url: videoUrl }))
    );
    expect(bare.problems).toEqual([{ clipId, problem: UNPLAYABLE_PUBLIC_CLIP_PROBLEM }]);
  });
});
