import { mp4DurationSeconds } from '@/lib/album/mp4-audio';

type Seekable = { length: number; end(index: number): number };

/** Finite media length, or the end of the seekable range once the browser knows it. */
export function knownMediaDuration(media: { duration: number; seekable: Seekable }): number | null {
  if (Number.isFinite(media.duration) && media.duration > 0) return media.duration;
  if (media.seekable.length < 1) return null;
  const end = media.seekable.end(media.seekable.length - 1);
  if (!Number.isFinite(end) || end <= 0) return null;
  return end;
}

/**
 * Duration of a public MP4 from its movie header.
 * Suno writes that header at the end, so one suffix range is enough.
 */
type RangeFetch = (
  url: string,
  init: { headers: { Range: string }; referrerPolicy: ReferrerPolicy; signal: AbortSignal }
) => Promise<Response>;

export async function remoteMp4Duration(
  url: string,
  fetchImpl?: RangeFetch
): Promise<number | null> {
  const fetchRange = fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (fetchRange === null) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetchRange(url, {
      headers: { Range: 'bytes=-131072' },
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (response.status !== 206) {
      await response.body?.cancel();
      return null;
    }
    return mp4DurationSeconds(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
