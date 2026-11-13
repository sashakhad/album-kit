import { isPlayableStream, type SunoClip } from '@/lib/album/stream-url';

/** Unauthenticated clip record. `audio_url` on this payload is not playable media. */
export const SUNO_CLIP_ENDPOINT = 'https://studio-api.prod.suno.com/api/clip/';

export const PUBLISH_CLIP_PROBLEM = 'publish the clip on Suno';
export const UNREADABLE_CLIP_PROBLEM = 'Could not read the clip from Suno';
export const UNPLAYABLE_PUBLIC_CLIP_PROBLEM = 'The public clip has no playable MP4';

const CLIP_ID = /^[A-Za-z0-9_-]+$/;

export type ClipStreamProblem = {
  clipId: string;
  problem: string;
};

type ClipLookup = { streamUrl: string } | { problem: string };

/**
 * Use a playable audio_url when one was supplied. Otherwise read the public clip's video_url.
 * Private and missing clips report `publish the clip on Suno`.
 */
export async function resolveClipStreams(
  clips: readonly SunoClip[],
  fetchImpl: typeof fetch = fetch
): Promise<{ clips: SunoClip[]; problems: ClipStreamProblem[] }> {
  const resolved: SunoClip[] = [];
  const problems: ClipStreamProblem[] = [];
  const seen = new Set<string>();
  for (const clip of clips) {
    if (seen.has(clip.id)) {
      continue;
    }
    seen.add(clip.id);
    const audioUrl = clip.audio_url;
    if (typeof audioUrl === 'string' && isPlayableStream(audioUrl, clip.id)) {
      resolved.push({ id: clip.id, audio_url: audioUrl });
      continue;
    }
    const lookedUp = await lookupPublicClip(clip.id, fetchImpl);
    if ('problem' in lookedUp) {
      problems.push({ clipId: clip.id, problem: lookedUp.problem });
      continue;
    }
    resolved.push({ id: clip.id, audio_url: lookedUp.streamUrl });
  }
  return { clips: resolved, problems };
}

async function lookupPublicClip(clipId: string, fetchImpl: typeof fetch): Promise<ClipLookup> {
  if (!CLIP_ID.test(clipId)) {
    return { problem: PUBLISH_CLIP_PROBLEM };
  }
  let response: Response;
  try {
    response = await fetchImpl(`${SUNO_CLIP_ENDPOINT}${clipId}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    return { problem: UNREADABLE_CLIP_PROBLEM };
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return { problem: PUBLISH_CLIP_PROBLEM };
  }
  if (!response.ok) {
    return { problem: UNREADABLE_CLIP_PROBLEM };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!isRecord(body) || body.is_public !== true) {
    return { problem: PUBLISH_CLIP_PROBLEM };
  }
  const videoUrl = body.video_url;
  if (typeof videoUrl !== 'string' || !isPlayableStream(videoUrl, clipId)) {
    return { problem: UNPLAYABLE_PUBLIC_CLIP_PROBLEM };
  }
  return { streamUrl: videoUrl };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
