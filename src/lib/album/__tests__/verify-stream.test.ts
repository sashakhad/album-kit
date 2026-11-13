import { describe, expect, it } from 'vitest';

import { mediaResponseOk, streamCheckLine, verifyStreams } from '@/lib/album/verify-stream';

describe('stream media check', () => {
  it('accepts audio and video responses and rejects html', () => {
    expect(mediaResponseOk(200, 'audio/mpeg')).toBe(true);
    expect(mediaResponseOk(206, 'video/mp4')).toBe(true);
    expect(mediaResponseOk(200, 'text/html')).toBe(false);
    expect(mediaResponseOk(403, 'audio/mpeg')).toBe(false);
  });

  it('reports how many stored streams returned 200', async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      const target = String(url);
      const status = target.endsWith('wait') ? 403 : target.endsWith('bad') ? 500 : 200;
      const type = status === 200 ? 'video/mp4' : 'text/plain';
      return new Response('x', { status, headers: { 'content-type': type } });
    }) as typeof fetch;

    const result = await verifyStreams(
      ['https://cdn1.suno.ai/a.mp4', 'https://cdn1.suno.ai/wait', 'https://cdn1.suno.ai/bad'],
      fetchImpl
    );

    expect(result.ok).toBe(1);
    expect(result.waiting).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.line).toBe(
      '1/3 streams returned 200. 1 is waiting to be published on Suno. 1 failed.'
    );
    expect(streamCheckLine({ ok: 2, waiting: 0, failed: 0 })).toBe('2/2 streams returned 200.');
  });
});
