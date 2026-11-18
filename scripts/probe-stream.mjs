#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RANGE = 'bytes=0-31';

/**
 * A public Suno file is playable when a ranged GET returns 200 or 206
 * and the body is video/mp4 or audio. A streaming status is not this check.
 */
export function handoffMediaOk(status, contentType) {
  if (status !== 200 && status !== 206) return false;
  if (typeof contentType !== 'string') return false;
  const type = contentType.split(';', 1)[0].trim().toLowerCase();
  return type === 'video/mp4' || type.startsWith('audio/');
}

export async function probeHandoff(url, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Range: RANGE },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    await response.body?.cancel().catch(() => undefined);
    const contentType = response.headers.get('content-type');
    return {
      ok: handoffMediaOk(response.status, contentType),
      status: response.status,
      contentType,
    };
  } catch {
    return { ok: false, status: 0, contentType: null };
  }
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const url = process.argv[2];
  if (process.argv.length !== 3 || typeof url !== 'string' || url.length === 0) {
    console.error('Usage: node scripts/probe-stream.mjs <streamUrl>');
    process.exitCode = 1;
  } else {
    const result = await probeHandoff(url);
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  }
}
