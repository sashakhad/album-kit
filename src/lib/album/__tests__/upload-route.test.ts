// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { owner: true, conflict: null as string | null };

vi.mock('server-only', () => ({}));
vi.mock('@/lib/owner/auth', () => ({
  isOwnerRequest: () => state.owner,
}));
vi.mock('@/lib/album/blob-audio', async importOriginal => {
  const actual = await importOriginal<typeof import('../blob-audio')>();
  return {
    ...actual,
    findLetterConflict: async () => state.conflict,
  };
});
vi.mock('@vercel/blob/client', () => ({
  handleUpload: async (options: {
    body: { payload: { pathname: string } };
    onBeforeGenerateToken: (pathname: string) => Promise<Record<string, unknown>>;
  }) => {
    const settings = await options.onBeforeGenerateToken(options.body.payload.pathname);
    return { type: 'blob.generate-client-token', clientToken: 'token', settings };
  },
}));

import { POST } from '@/app/api/owner/upload/route';

function tokenRequest(pathname: string): Request {
  return new Request('http://localhost/api/owner/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'blob.generate-client-token',
      payload: { pathname, clientPayload: null, multipart: false },
    }),
  });
}

beforeEach(() => {
  state.owner = true;
  state.conflict = null;
});

describe('POST /api/owner/upload', () => {
  it('issues a token for a canonical take with the upload limits', async () => {
    const response = await POST(tokenRequest('takes/v1-07-track-seven-p3-takee.mp3'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      settings: {
        allowedContentTypes: ['audio/mpeg'],
        maximumSizeInBytes: 52428800,
        addRandomSuffix: false,
        allowOverwrite: false,
      },
    });
  });

  it('rejects non-owners and bad pathnames', async () => {
    expect((await POST(tokenRequest('takes/v1-07-Track-p3-takee.mp3'))).status).toBe(400);
    expect((await POST(tokenRequest('v1-07-track-seven-p3-takee.mp3'))).status).toBe(400);

    state.owner = false;
    const response = await POST(tokenRequest('takes/v1-07-track-seven-p3-takee.mp3'));
    expect(response.status).toBe(401);
  });

  it('refuses a letter that another file already uses', async () => {
    state.conflict = 'v1-07-track-seven-p2-takee.mp3';

    const response = await POST(tokenRequest('takes/v1-07-track-seven-p3-takee.mp3'));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error:
        'Take E of track 07 in set v1 already exists as v1-07-track-seven-p2-takee.mp3. Letters are never reused, so give this file the next free letter.',
    });
  });

  it('rejects a body that is not an upload event', async () => {
    const response = await POST(
      new Request('http://localhost/api/owner/upload', { method: 'POST', body: '{}' })
    );

    expect(response.status).toBe(400);
  });
});
