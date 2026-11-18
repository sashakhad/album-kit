import { isDirectSunoStream, isVideoStream } from '@/lib/album/stream-url';
import type { AlbumTake, AlbumVersion, EmbeddedAudio } from '@/lib/album/types';

const objectUrls = new Map<string, string>();

export function isEmbeddedAudio(value: EmbeddedAudio | undefined): value is EmbeddedAudio {
  if (value === undefined) return false;
  const mime = value.mime;
  const base64 = value.base64;
  if (!mime.startsWith('audio/') && !mime.startsWith('video/')) return false;
  return base64.length > 0;
}

export function embeddedAudioForUrl(version: AlbumVersion, url: string): EmbeddedAudio | null {
  for (const track of version.tracks) {
    const onTrack = embeddedOnTakes(track.takes, url);
    if (onTrack !== null) return onTrack;
    const parked = embeddedOnTakes(track.parkedTakes ?? [], url);
    if (parked !== null) return parked;
  }
  return null;
}

/** A public CDN url still needs the network when its bytes were not inlined. */
export function takeNeedsNetwork(take: Pick<AlbumTake, 'audioUrl' | 'embeddedAudio'>): boolean {
  return isDirectSunoStream(take.audioUrl) && !isEmbeddedAudio(take.embeddedAudio);
}

/** Audio extracted from an MP4 plays on the audio element. A full MP4 stays on video. */
export function playbackUsesVideo(url: string, embedded: EmbeddedAudio | null): boolean {
  if (embedded !== null && isEmbeddedAudio(embedded)) return embedded.mime.startsWith('video/');
  return isVideoStream(url);
}

export function objectUrlForEmbedded(remoteUrl: string, embedded: EmbeddedAudio): string {
  const key = `${remoteUrl}\0${embedded.mime}\0${String(embedded.base64.length)}`;
  const cached = objectUrls.get(key);
  if (cached !== undefined) return cached;
  const bytes = decodeBase64(embedded.base64);
  const objectUrl = URL.createObjectURL(new Blob([bytes.buffer], { type: embedded.mime }));
  objectUrls.set(key, objectUrl);
  return objectUrl;
}

export function clearEmbeddedUrls(): void {
  for (const url of objectUrls.values()) {
    if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
  }
  objectUrls.clear();
}

export function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    const code = binary.charCodeAt(index);
    bytes[index] = code;
  }
  return bytes;
}

function embeddedOnTakes(takes: readonly AlbumTake[], url: string): EmbeddedAudio | null {
  for (const take of takes) {
    if (take.audioUrl === url && isEmbeddedAudio(take.embeddedAudio)) return take.embeddedAudio;
  }
  return null;
}
