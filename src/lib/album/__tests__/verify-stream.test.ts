import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PUBLISH_PROPAGATION_DELAYS_MS,
  PUBLISH_RETRY_NOTE,
  VERIFY_MAX_DURATION_SECONDS,
  mediaResponseOk,
  nextStreamCheck,
  streamCheckLine,
  verifyStreams,
  verifyStreamsPass,
} from '@/lib/album/verify-stream';

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
      fetchImpl,
      { retryDelaysMs: [] }
    );

    expect(result.ok).toBe(1);
    expect(result.waiting).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.retried).toBe(false);
    expect(result.line).toBe(
      '1/3 streams returned 200. 1 is waiting to be published on Suno. 1 failed.'
    );
    expect(streamCheckLine({ ok: 2, waiting: 0, failed: 0 })).toBe('2/2 streams returned 200.');
  });

  it('retries a fresh 403 with backoff and says so', async () => {
    const waits: number[] = [];
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      const status = calls === 1 ? 403 : 200;
      return new Response('x', { status, headers: { 'content-type': 'video/mp4' } });
    }) as typeof fetch;

    const result = await verifyStreams(['https://cdn1.suno.ai/fresh.mp4'], fetchImpl, {
      retryDelaysMs: [25, 25],
      sleep: async ms => {
        waits.push(ms);
      },
    });

    expect(waits).toEqual([25]);
    expect(result.ok).toBe(1);
    expect(result.waiting).toBe(0);
    expect(result.retried).toBe(true);
    expect(result.line).toBe(`1/1 streams returned 200. ${PUBLISH_RETRY_NOTE}`);
  });

  it('stops retrying a 403 after a few minutes and still reports the wait', async () => {
    const waits: number[] = [];
    const fetchImpl = (async () =>
      new Response('no', {
        status: 403,
        headers: { 'content-type': 'text/plain' },
      })) as typeof fetch;

    const result = await verifyStreams(['https://cdn1.suno.ai/stuck.mp4'], fetchImpl, {
      retryDelaysMs: [5, 5],
      sleep: async ms => {
        waits.push(ms);
      },
    });

    expect(waits).toEqual([5, 5]);
    expect(result.ok).toBe(0);
    expect(result.waiting).toBe(1);
    expect(result.retried).toBe(true);
    expect(result.line).toBe(
      `0/1 streams returned 200. 1 is waiting to be published on Suno. ${PUBLISH_RETRY_NOTE}`
    );
  });

  it('probes one batch inside the 60 second cap and leaves the rest unchecked', async () => {
    const urls = Array.from({ length: 10 }, (_, index) => `https://cdn1.suno.ai/${index}.mp4`);
    const fetchImpl = (async () =>
      new Response('x', { status: 200, headers: { 'content-type': 'video/mp4' } })) as typeof fetch;
    const pass = await verifyStreamsPass(urls, 0, fetchImpl, { budgetMs: 0 });
    expect(pass.ok).toBe(8);
    expect(pass.unchecked).toEqual(urls.slice(8));
    expect(pass.retryUrls).toEqual([]);
    expect(VERIFY_MAX_DURATION_SECONDS).toBe(60);
    const route = readFileSync(
      path.join(process.cwd(), 'src/app/api/owner/streams/verify/route.ts'),
      'utf8'
    );
    expect(route).toContain('export const maxDuration = 60');
    expect(route).not.toContain('maxDuration = 300');
  });

  it('returns a 403 for a later call instead of sleeping inside this one', async () => {
    const url = 'https://cdn1.suno.ai/fresh.mp4';
    const fetchImpl = (async () =>
      new Response('no', {
        status: 403,
        headers: { 'content-type': 'text/plain' },
      })) as typeof fetch;
    const pass = await verifyStreamsPass([url], 0, fetchImpl, { delays: [10_000] });
    expect(pass.retryUrls).toEqual([url]);
    expect(pass.nextDelayMs).toBe(10_000);
    expect(pass.waiting).toBe(0);
    const step = nextStreamCheck(
      { attempt: 0, pending: null, ok: 0, waiting: 0, failed: 0, retried: false },
      pass
    );
    expect(step.done).toBe(false);
    expect(step.sleepMs).toBe(10_000);
    expect(step.state.pending).toEqual([url]);
    expect(step.state.attempt).toBe(1);
  });

  it('waits a few minutes by default, long enough for a new Suno MP4', () => {
    let total = 0;
    for (const delay of PUBLISH_PROPAGATION_DELAYS_MS) {
      total += delay;
    }
    expect(total).toBeGreaterThanOrEqual(120_000);
    expect(total).toBeLessThanOrEqual(180_000);
  });
});
