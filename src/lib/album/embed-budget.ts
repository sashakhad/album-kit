/**
 * Review-audio budget for Open Album.html.
 *
 * Grok chat rejects an attachment over 25 MB. 24_000_000 bytes stays under both
 * a decimal 25 MB cap and a 25 MiB cap. The player shell is about half a
 * megabyte, and base64 expands the audio by 4/3, so the bitrate has to come
 * from the total duration rather than from Suno's original AAC (~192 kbps).
 *
 * The native ffmpeg `aac` encoder is AAC-LC. HE-AAC needs libfdk_aac, which is
 * not part of a normal ffmpeg build and is not used here.
 */

export const PAGE_BYTE_BUDGET = 24_000_000;

export const BITRATE_FLOOR_KBPS = 48;

export const BITRATE_CEILING_KBPS = 96;

export const BITRATE_STEP_KBPS = 8;

/** Used when the MP4 duration cannot be read. Long enough for a Suno take. */
export const UNKNOWN_TAKE_SECONDS = 240;

export const REVIEW_BITRATES_KBPS: readonly number[] = [96, 88, 80, 72, 64, 56, 48];

/** Measured AAC files land about 4% over `bitrate * duration`. Leave a little more. */
const ENCODER_SLACK = 1.05;

const CONTAINER_BYTES = 8 * 1024;

const TAKE_MARKUP_BYTES = 2_048;

const ALBUM_OVERHEAD_BYTES = 8_192;

export type BudgetTake = {
  id: string;
  trackNumber: number;
  order: number;
  /** Bytes this take adds to the HTML, usually the base64 length. */
  pageBytes: number;
};

export function albumPageName(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('An album page index starts at 0.');
  }
  if (index === 0) return 'Open Album.html';
  return `Open Album ${String(index + 1)}.html`;
}

export function base64Length(byteLength: number): number {
  if (!Number.isFinite(byteLength) || byteLength <= 0) return 0;
  return Math.ceil(byteLength / 3) * 4;
}

export function estimatedAudioBytes(durationSeconds: number, bitrateKbps: number): number {
  const seconds = durationSeconds > 0 ? durationSeconds : UNKNOWN_TAKE_SECONDS;
  const payload = (bitrateKbps * 1000 * seconds) / 8;
  return Math.ceil(payload * ENCODER_SLACK + CONTAINER_BYTES);
}

export function estimatedPageBytes(args: {
  durationsSeconds: readonly number[];
  bitrateKbps: number;
  shellBytes: number;
}): number {
  let total = args.shellBytes + ALBUM_OVERHEAD_BYTES;
  for (const duration of args.durationsSeconds) {
    total += base64Length(estimatedAudioBytes(duration, args.bitrateKbps));
    total += TAKE_MARKUP_BYTES;
  }
  return total;
}

/** Highest review step whose estimate fits. The floor when nothing does. */
export function reviewBitrateKbps(args: {
  durationsSeconds: readonly number[];
  shellBytes: number;
  budgetBytes?: number;
}): number {
  const budget = args.budgetBytes ?? PAGE_BYTE_BUDGET;
  if (args.durationsSeconds.length === 0) return BITRATE_CEILING_KBPS;
  for (const bitrate of REVIEW_BITRATES_KBPS) {
    if (
      estimatedPageBytes({
        durationsSeconds: args.durationsSeconds,
        bitrateKbps: bitrate,
        shellBytes: args.shellBytes,
      }) <= budget
    ) {
      return bitrate;
    }
  }
  return BITRATE_FLOOR_KBPS;
}

export function lowerReviewBitrate(bitrateKbps: number): number | null {
  const next = bitrateKbps - BITRATE_STEP_KBPS;
  if (next < BITRATE_FLOOR_KBPS) return null;
  return next;
}

export function pageFitsBudget(args: {
  durationsSeconds: readonly number[];
  bitrateKbps: number;
  shellBytes: number;
  budgetBytes?: number;
}): boolean {
  const budget = args.budgetBytes ?? PAGE_BYTE_BUDGET;
  return estimatedPageBytes(args) <= budget;
}

function compareTakes(left: BudgetTake, right: BudgetTake): number {
  if (left.trackNumber !== right.trackNumber) return left.trackNumber - right.trackNumber;
  if (left.order !== right.order) return left.order - right.order;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function pageSize(shellBytes: number, takes: readonly BudgetTake[]): number {
  let total = shellBytes;
  for (const take of takes) total += take.pageBytes;
  return total;
}

/**
 * Pack takes into the fewest pages that stay within the budget.
 * A track stays on one page when the whole track fits. A take that cannot
 * fit even alone is still emitted, on a page by itself.
 * Input order does not matter. The result follows track number, then order, then id.
 */
export function packPagesBySize(
  takes: readonly BudgetTake[],
  shellBytes: number,
  budgetBytes: number
): string[][] {
  const ordered = [...takes].sort(compareTakes);
  const byTrack: BudgetTake[][] = [];
  for (const take of ordered) {
    const current = byTrack[byTrack.length - 1];
    if (current !== undefined && current[0]?.trackNumber === take.trackNumber) {
      current.push(take);
    } else {
      byTrack.push([take]);
    }
  }

  const groups: BudgetTake[][] = [];
  let page: BudgetTake[] = [];

  function flush(): void {
    if (page.length === 0) return;
    groups.push(page);
    page = [];
  }

  for (const track of byTrack) {
    const trackFits = pageSize(shellBytes, track) <= budgetBytes;
    if (trackFits && page.length > 0 && pageSize(shellBytes, [...page, ...track]) <= budgetBytes) {
      for (const take of track) page.push(take);
      continue;
    }
    if (trackFits) {
      flush();
      for (const take of track) page.push(take);
      continue;
    }
    for (const take of track) {
      if (page.length > 0 && pageSize(shellBytes, [...page, take]) > budgetBytes) flush();
      page.push(take);
    }
  }
  flush();
  if (groups.length === 0) return [[]];
  const ids: string[][] = [];
  for (const group of groups) {
    const pageIds: string[] = [];
    for (const take of group) pageIds.push(take.id);
    ids.push(pageIds);
  }
  return ids;
}
