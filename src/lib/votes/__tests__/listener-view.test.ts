// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({
  albumKey: () => 'test-owner-key',
  OWNER_VISITOR_ID: 'owner',
}));
vi.mock('@/lib/owner/viewer', () => ({ viewerInviteId: async () => null }));
vi.mock('@/lib/votes/board', () => ({ getVoteSnapshot: async () => ({}) }));
vi.mock('@/lib/votes/blind', () => ({
  blindSnapshot: async (snapshot: unknown) => snapshot,
  blindVersion: async (version: unknown) => version,
  opaqueAudioId: () => 'a'.repeat(32),
}));
vi.mock('@/lib/votes/pass-store', () => ({
  getConsolidatedPassVersion: async () => ({ tracks: [] }),
  getVisitorCurrentRound: async () => 1,
}));
vi.mock('@/lib/votes/exposure', () => ({
  isBlindForListenerSnapshot: async () => false,
  markExposed: async () => undefined,
}));
vi.mock('@/lib/votes/provenance', () => ({
  withVisibleDetails: async (version: unknown) => version,
}));
vi.mock('@/lib/votes/listener-id', () => ({
  inviteListenerVisitorId: () => '',
  listenerIdFromPage: async () => null,
  publicListenerVisitorId: () => '',
}));

import { collectPlayableIndexes } from '@/lib/album/playback';
import { mediaResponseOk } from '@/lib/album/verify-stream';
import type { AlbumTake, AlbumVersion } from '@/lib/album/types';
import { withListenerPlayback } from '@/lib/votes/listener-view';

const streamUrl = 'https://cdn1.suno.ai/clip-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4';
const proxy = `/api/blind-audio/1/${'a'.repeat(32)}`;
const pageUrl = 'http://localhost/vote';

function take(audioUrl: string): AlbumTake {
  return {
    label: 'A',
    filename: 'v1-01-track-one-p1-takea.mp3',
    audioUrl,
    versionSlug: 'v1',
    voteLabel: 'A',
  };
}

function version(audioUrl: string): AlbumVersion {
  const first = take(audioUrl);
  return {
    slug: 'v1',
    folder: 'v1',
    title: 'Fixture',
    author: 'Fixture',
    blurb: '',
    tracks: [
      {
        number: 1,
        title: 'Track One',
        kind: 'album',
        filename: first.filename,
        audioUrl: first.audioUrl,
        takes: [first],
        prompt: null,
      },
    ],
  };
}

function installPlayerFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === streamUrl) {
        return new Response('ftypisom', {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        });
      }
      if (url === pageUrl) {
        return new Response('<!doctype html><html>Compare takes</html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    })
  );
}

/** Audio bytes from the URL the player will request. A loaded HTML page is not audio. */
async function audioBytes(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (!mediaResponseOk(response.status, response.headers.get('content-type'))) {
    return null;
  }
  const body = await response.text();
  const head = body.trimStart().toLowerCase();
  if (body.length === 0 || head.startsWith('<') || head.startsWith('{')) {
    return null;
  }
  return body;
}

function announcedPlayable(played: AlbumVersion, playerUrlHasAudio: boolean): number[] {
  if (!playerUrlHasAudio) {
    return [];
  }
  return collectPlayableIndexes(played.tracks);
}

describe('withListenerPlayback', () => {
  it('announces a public Suno take playable only when the player URL returns audio bytes', async () => {
    installPlayerFetch();
    try {
      const played = withListenerPlayback(version(streamUrl), 1);
      const playerUrl = played.tracks[0]?.takes[0]?.audioUrl ?? '';

      expect(playerUrl).toBe(streamUrl);
      expect(played.tracks[0]?.audioUrl).toBe(streamUrl);
      const bytes = await audioBytes(playerUrl);
      expect(bytes).toBe('ftypisom');
      expect(announcedPlayable(played, bytes !== null)).toEqual([0]);
      expect(await audioBytes(proxy)).toBeNull();
      expect(await audioBytes(pageUrl)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses the blind-audio proxy when the take has no direct Suno stream', () => {
    const played = withListenerPlayback(version('/api/audio/v1/v1-01-track-one-p1-takea.mp3'), 1);
    expect(played.tracks[0]?.audioUrl).toBe(proxy);
    expect(played.tracks[0]?.takes[0]?.audioUrl).toBe(proxy);
  });
});
