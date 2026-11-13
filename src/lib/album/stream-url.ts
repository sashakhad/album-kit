const SUNO_CDN_HOST = /^cdn\d+\.suno\.ai$/;
const SUNO_STREAM_PATH = /^\/([A-Za-z0-9_-]+)\.(mp3|mp4)$/;

export type SunoClip = {
  id: string;
  audio_url?: string | null | undefined;
};

export type StreamCatalogEntry = {
  filename: string;
  clipId: string;
  streamUrl: string;
};

export type StoredTakeStream = {
  filename: string;
  clipId: string | null;
  outputId?: string | null;
  streamUrl: string | null;
};

export type StreamRefresh = {
  filename: string;
  clipId: string;
  streamUrl: string;
};

export type StreamLinkStatus = 'ready' | 'missing' | 'stale';

export function parseSunoStreamUrl(url: string): { clipId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    !SUNO_CDN_HOST.test(parsed.hostname)
  ) {
    return null;
  }
  const clipId = SUNO_STREAM_PATH.exec(parsed.pathname)?.[1];
  if (clipId === undefined) {
    return null;
  }
  return { clipId };
}

/** Public clip MP4s need a video element. Uploaded files and older MP3 streams stay audio. */
export function isVideoStream(url: string | null | undefined): boolean {
  if (url === undefined || url === null || url.length === 0) {
    return false;
  }
  try {
    return new URL(url, 'https://album.local').pathname.endsWith('.mp4');
  } catch {
    return false;
  }
}

export function isDirectSunoStream(url: string | null | undefined): boolean {
  return url !== undefined && url !== null && url.length > 0 && parseSunoStreamUrl(url) !== null;
}

export function isPlayableStream(
  streamUrl: string | null | undefined,
  clipId: string | null | undefined
): boolean {
  if (
    streamUrl === undefined ||
    streamUrl === null ||
    clipId === undefined ||
    clipId === null ||
    clipId.length === 0
  ) {
    return false;
  }
  return parseSunoStreamUrl(streamUrl)?.clipId === clipId;
}

export function resolvedClipId(take: {
  clipId?: string | null | undefined;
  outputId?: string | null | undefined;
}): string | null {
  if (take.clipId !== undefined && take.clipId !== null && take.clipId.length > 0) {
    return take.clipId;
  }
  if (take.outputId !== undefined && take.outputId !== null && take.outputId.length > 0) {
    return take.outputId;
  }
  return null;
}

/** Prefer a stored Suno MP3 or public-clip MP4. An older uploaded file remains the fallback. */
export function playbackAudioUrl(args: {
  streamUrl: string | null | undefined;
  clipId: string | null | undefined;
  fileUrl: string | null;
}): string | null {
  const streamUrl = args.streamUrl ?? null;
  if (streamUrl !== null && isPlayableStream(streamUrl, args.clipId)) {
    return streamUrl;
  }
  return args.fileUrl;
}

export function listenerAudioUrl(storedUrl: string, proxiedUrl: string): string {
  return isDirectSunoStream(storedUrl) ? storedUrl : proxiedUrl;
}

export function streamLinkStatus(args: {
  clipId: string | null;
  streamUrl: string | null;
}): StreamLinkStatus {
  if (args.streamUrl === null || args.streamUrl.length === 0) {
    return 'missing';
  }
  if (!isPlayableStream(args.streamUrl, args.clipId)) {
    return 'stale';
  }
  return 'ready';
}

export function takeStreamProblem(take: {
  outputId: string | null;
  clipId?: string | null | undefined;
  streamUrl?: string | null | undefined;
}): string | null {
  const clipId = take.clipId ?? null;
  if (clipId !== null && take.outputId !== null && clipId !== take.outputId) {
    return 'Clip id and output id must be the same Suno clip';
  }
  if (take.streamUrl === undefined || take.streamUrl === null || take.streamUrl.length === 0) {
    return null;
  }
  if (!isPlayableStream(take.streamUrl, clipId ?? take.outputId)) {
    return 'Stream URL must be the Suno MP3 or MP4 for that clip';
  }
  return null;
}

export function takeIsCollected(take: {
  outputId: string | null;
  clipId?: string | null | undefined;
  streamUrl?: string | null | undefined;
  downloaded: boolean;
  uploaded: boolean;
}): boolean {
  if (isPlayableStream(take.streamUrl, resolvedClipId(take))) {
    return true;
  }
  return take.downloaded && take.uploaded;
}

/**
 * Replace a missing or stale stream with a playable Suno MP3 or MP4 for that clip.
 * Rows whose audio_url is not that clip's CDN stream are ignored.
 */
export function refreshStoredStreams(
  stored: readonly StoredTakeStream[],
  clips: readonly SunoClip[]
): StreamRefresh[] {
  const audioByClip = new Map<string, string>();
  for (const clip of clips) {
    const audioUrl = clip.audio_url;
    if (typeof audioUrl === 'string' && isPlayableStream(audioUrl, clip.id)) {
      audioByClip.set(clip.id, audioUrl);
    }
  }

  const updates: StreamRefresh[] = [];
  for (const take of stored) {
    const clipId = resolvedClipId(take);
    if (clipId === null) {
      continue;
    }
    const fresh = audioByClip.get(clipId);
    if (fresh === undefined || (take.clipId === clipId && take.streamUrl === fresh)) {
      continue;
    }
    updates.push({ filename: take.filename, clipId, streamUrl: fresh });
  }
  return updates;
}

export function filenamesForPlayback(
  files: readonly string[],
  catalog: readonly { filename: string }[]
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const name of files) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    merged.push(name);
  }
  for (const item of catalog) {
    if (seen.has(item.filename)) {
      continue;
    }
    seen.add(item.filename);
    merged.push(item.filename);
  }
  return merged;
}
