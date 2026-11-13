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
  line: string;
};

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

export function streamCheckLine(args: { ok: number; waiting: number; failed: number }): string {
  const total = args.ok + args.waiting + args.failed;
  if (total === 0) {
    return 'No stored streams to verify.';
  }
  const checked = `${formatNumberExact(args.ok)}/${formatNumberExact(total)} streams returned 200.`;
  if (args.waiting === 0 && args.failed === 0) {
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
  return parts.join(' ');
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
  fetchImpl: typeof fetch = fetch
): Promise<StreamCheck> {
  let ok = 0;
  let waiting = 0;
  let failed = 0;
  const queue = [...urls];
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(8, queue.length);
  for (let index = 0; index < workerCount; index += 1) {
    workers.push(checkNext());
  }
  await Promise.all(workers);
  return {
    ok,
    waiting,
    failed,
    total: ok + waiting + failed,
    line: streamCheckLine({ ok, waiting, failed }),
  };

  async function checkNext(): Promise<void> {
    const url = queue.shift();
    if (url === undefined) {
      return;
    }
    const result = await probeStream(url, fetchImpl);
    if (result.ok) {
      ok += 1;
    } else if (result.status === 401 || result.status === 403 || result.status === 404) {
      waiting += 1;
    } else {
      failed += 1;
    }
    await checkNext();
  }
}
