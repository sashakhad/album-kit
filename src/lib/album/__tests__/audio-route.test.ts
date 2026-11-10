// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseAlbumConfig } from '../album-config';

const BLOB_URL = 'https://store123.public.blob.vercel-storage.com/takes/';
const PINNED = 'v1-01-track-one-p1-takea.mp3';
const UNPINNED = 'v1-01-track-one-p1-takeb.mp3';

const ownerState = { owner: false };
const viewerState = { viewer: false };
const settingsState = { visibility: 'public', listenerVoting: false };
const fetchMock = vi.fn();
const privateGetMock = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@vercel/blob', () => ({ get: (...args: unknown[]) => privateGetMock(...args) }));
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
vi.mock('@/lib/album/listen-store', () => ({
  getListenConfig: async () => (await import('@/lib/album/album-config')).loadAlbumConfig(),
}));
vi.mock('@/lib/album/blob-audio', () => ({
  resolveBlobAudioUrl: async (args: { filename: string }) => `${BLOB_URL}${args.filename}`,
}));
vi.mock('@/lib/owner/auth', () => ({
  isOwnerRequest: () => ownerState.owner,
}));
vi.mock('@/lib/settings/store', () => ({ loadSettings: async () => settingsState }));
vi.mock('@/lib/owner/viewer', () => ({ isViewerRequest: async () => viewerState.viewer }));

import { GET } from '@/app/api/audio/[set]/[file]/route';

function get(set: string, file: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost/api/audio/${set}/${file}`, { headers }), {
    params: Promise.resolve({ set, file }),
  });
}

beforeEach(() => {
  ownerState.owner = false;
  viewerState.viewer = false;
  settingsState.visibility = 'public';
  settingsState.listenerVoting = false;
  fetchMock.mockReset();
  privateGetMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(process, 'cwd').mockReturnValue('/nonexistent-album-kit-root');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/audio/[set]/[file]', () => {
  it('streams owner audio without exposing the Blob URL', async () => {
    ownerState.owner = true;
    fetchMock.mockResolvedValueOnce(
      new Response('ID3audio', { status: 200, headers: { 'content-type': 'audio/mpeg' } })
    );

    const response = await get('v1', UNPINNED);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
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

  it('keeps unpinned canonical audio owner-only even when listener voting is on', async () => {
    settingsState.listenerVoting = true;
    const response = await get('v1', UNPINNED);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gates private audio and streams pinned audio only for invited listeners', async () => {
    settingsState.visibility = 'private';
    vi.stubEnv('BLOB_ACCESS', 'private');
    expect((await get('v1', PINNED)).status).toBe(404);
    expect(privateGetMock).not.toHaveBeenCalled();
    viewerState.viewer = true;
    privateGetMock.mockResolvedValue({
      statusCode: 200,
      stream: new Response('audio').body,
      headers: new Headers({ 'accept-ranges': 'bytes' }),
      blob: { contentType: 'audio/mpeg', size: 5 },
    });
    const response = await get('v1', PINNED);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(privateGetMock).toHaveBeenCalledWith(`takes/${PINNED}`, { access: 'private' });
    expect((await get('v1', UNPINNED)).status).toBe(401);
  });

  it('forwards byte ranges from a private store without disclosing its URL', async () => {
    ownerState.owner = true;
    settingsState.visibility = 'private';
    vi.stubEnv('BLOB_ACCESS', 'private');
    privateGetMock.mockResolvedValue({
      statusCode: 200,
      stream: new Response('bytes').body,
      headers: new Headers({ 'content-range': 'bytes 0-4/100', 'accept-ranges': 'bytes' }),
      blob: { contentType: 'audio/mpeg', size: 5 },
    });
    const response = await get('v1', PINNED, { range: 'bytes=0-4' });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-4/100');
    expect(response.headers.get('location')).toBeNull();
    expect(privateGetMock).toHaveBeenCalledWith(`takes/${PINNED}`, {
      access: 'private',
      headers: { range: 'bytes=0-4' },
    });
  });

  it('returns 404 for an unknown set or a file from another set', async () => {
    ownerState.owner = true;

    expect((await get('v9', 'v9-01-track-one-p1-takea.mp3')).status).toBe(404);
    expect((await get('v1', 'v2-01-track-one-p1-takea.mp3')).status).toBe(404);
    expect((await get('v1', 'notes.txt')).status).toBe(404);
  });
});
