import { formatNumberExact } from '@/lib/formatters';

export type StreamProbe = {
  ok: boolean;
  status: number;
};

export type StreamCheck = {
  ok: number;
  waiting: number;
  failed: number;
  total: number;
  retried: boolean;
  line: string;
};

/**
 * Waits between probes while a newly published Suno MP4 still returns 403.
 * The waits add up to a few minutes, which covers the usual 1–2 minute delay
 * after publish_pending is false. The route budget is 300 seconds.
 */
export const PUBLISH_PROPAGATION_DELAYS_MS: readonly number[] = [
  10_000, 20_000, 30_000, 40_000, 40_000, 40_000,
];

export const PUBLISH_RETRY_NOTE = 'Retried newly published files that returned 403.';

/** A ranged GET is playable media when it returns 200 or 206 with an audio or video type. */
export function mediaResponseOk(status: number, contentType: string | null): boolean {
  if (status !== 200 && status !== 206) {
    return false;
  }
  if (contentType === null || contentType.trim().length === 0) {
    return true;
  }
  const type = contentType.toLowerCase();
  return (
    type.startsWith('audio/') ||
    type.startsWith('video/') ||
    type.startsWith('application/octet-stream')
  );
}

export function streamCheckLine(args: {
  ok: number;
  waiting: number;
  failed: number;
  retried?: boolean;
}): string {
  const total = args.ok + args.waiting + args.failed;
  if (total === 0) {
    return 'No stored streams to verify.';
  }
  const checked = `${formatNumberExact(args.ok)}/${formatNumberExact(total)} streams returned 200.`;
  if (args.waiting === 0 && args.failed === 0 && args.retried !== true) {
    return checked;
  }
  const parts = [checked];
  if (args.waiting > 0) {
    parts.push(
      `${formatNumberExact(args.waiting)} ${args.waiting === 1 ? 'is' : 'are'} waiting to be published on Suno.`
    );
  }
  if (args.failed > 0) {
    parts.push(`${formatNumberExact(args.failed)} failed.`);
  }
  if (args.retried === true) {
    parts.push(PUBLISH_RETRY_NOTE);
  }
  return parts.join(' ');
}

function wait(ms: number): Promise<void> {
  return new Promise(function resolveLater(resolve) {
    setTimeout(function finish() {
      resolve();
    }, ms);
  });
}

async function probeAll(urls: readonly string[], fetchImpl: typeof fetch): Promise<StreamProbe[]> {
  const results: StreamProbe[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(8, urls.length);
  const workers: Promise<void>[] = [];
  for (let index = 0; index < workerCount; index += 1) {
    workers.push(takeNext());
  }
  await Promise.all(workers);
  return results;

  async function takeNext(): Promise<void> {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= urls.length) {
      return;
    }
    const url = urls[index];
    if (url === undefined) {
      return;
    }
    results[index] = await probeStream(url, fetchImpl);
    await takeNext();
  }
}

export async function probeStream(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<StreamProbe> {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    await response.body?.cancel().catch(() => undefined);
    return {
      ok: mediaResponseOk(response.status, response.headers.get('content-type')),
      status: response.status,
    };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function verifyStreams(
  urls: readonly string[],
  fetchImpl: typeof fetch = fetch,
  options?: {
    sleep?: (ms: number) => Promise<void>;
    retryDelaysMs?: readonly number[];
  }
): Promise<StreamCheck> {
  const sleep = options?.sleep ?? wait;
  const delays = options?.retryDelaysMs ?? PUBLISH_PROPAGATION_DELAYS_MS;
  let ok = 0;
  let waiting = 0;
  let failed = 0;
  let pending = [...urls];
  let retried = false;

  for (let attempt = 0; ; attempt += 1) {
    const probes = await probeAll(pending, fetchImpl);
    const retrying: string[] = [];
    for (let index = 0; index < pending.length; index += 1) {
      const url = pending[index];
      const result = probes[index];
      if (url === undefined || result === undefined) {
        continue;
      }
      if (result.ok) {
        ok += 1;
      } else if (result.status === 403 && attempt < delays.length) {
        retrying.push(url);
      } else if (result.status === 401 || result.status === 403 || result.status === 404) {
        waiting += 1;
      } else {
        failed += 1;
      }
    }
    const delay = delays[attempt];
    if (retrying.length === 0 || delay === undefined) {
      break;
    }
    retried = true;
    await sleep(delay);
    pending = retrying;
  }

  return {
    ok,
    waiting,
    failed,
    total: ok + waiting + failed,
    retried,
    line: streamCheckLine({ ok, waiting, failed, retried }),
  };
}
