// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseAlbumConfig } from '../album-config';

const BLOB_URL = 'https://store123.public.blob.vercel-storage.com/takes/';
const PINNED = 'v1-01-track-one-p1-takea.mp3';
const UNPINNED = 'v1-01-track-one-p1-takeb.mp3';

const ownerState = { owner: false };
const fetchMock = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/album/album-config', async importOriginal => {
  const actual = await importOriginal<typeof import('../album-config')>();
  return {
    ...actual,
    loadAlbumConfig: async () =>
      parseAlbumConfig({
        title: 'Fixture Album',
        artist: '',
        genre: '',
        rule: '',
        sets: [{ id: 'v1', name: 'Bubu' }],
        tracks: [
          { number: 1, title: 'Track One', slug: 'track-one', listen: { set: 'v1', take: 'A' } },
        ],
      }),
  };
});
vi.mock('@/lib/album/blob-audio', () => ({
  resolveBlobAudioUrl: async (args: { filename: string }) => `${BLOB_URL}${args.filename}`,
}));
vi.mock('@/lib/owner/auth', () => ({
  isOwnerRequest: () => ownerState.owner,
}));

import { GET } from '@/app/api/audio/[set]/[file]/route';

function get(set: string, file: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost/api/audio/${set}/${file}`, { headers }), {
    params: Promise.resolve({ set, file }),
  });
}

beforeEach(() => {
  ownerState.owner = false;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(process, 'cwd').mockReturnValue('/nonexistent-album-kit-root');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /api/audio/[set]/[file]', () => {
  it('redirects the owner to Blob', async () => {
    ownerState.owner = true;

    const response = await get('v1', UNPINNED);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${BLOB_URL}${UNPINNED}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streams a pinned take to a signed-out visitor without revealing Blob', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('ID3partial', {
        status: 206,
        headers: {
          'content-type': 'audio/mpeg',
          'content-length': '10',
          'content-range': 'bytes 0-9/8339',
          'accept-ranges': 'bytes',
          'x-vercel-cache': 'HIT',
        },
      })
    );

    const response = await get('v1', PINNED, { range: 'bytes=0-9' });

    expect(fetchMock).toHaveBeenCalledWith(`${BLOB_URL}${PINNED}`, {
      headers: { range: 'bytes=0-9' },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('content-range')).toBe('bytes 0-9/8339');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-vercel-cache')).toBeNull();
    expect(await response.text()).toBe('ID3partial');
  });

  it('passes a full 200 response through when there is no range', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('ID3whole', {
        status: 200,
        headers: { 'content-type': 'audio/mpeg', 'content-length': '8' },
      })
    );

    const response = await get('v1', PINNED);

    expect(fetchMock).toHaveBeenCalledWith(`${BLOB_URL}${PINNED}`, {});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('8');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-range')).toBeNull();
  });

  it('keeps unpinned takes owner only', async () => {
    const response = await get('v1', UNPINNED);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown set or a file from another set', async () => {
    ownerState.owner = true;

    expect((await get('v9', 'v9-01-track-one-p1-takea.mp3')).status).toBe(404);
    expect((await get('v1', 'v2-01-track-one-p1-takea.mp3')).status).toBe(404);
    expect((await get('v1', 'notes.txt')).status).toBe(404);
  });
});
