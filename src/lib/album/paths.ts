import path from 'node:path';

import { isAudioFilename } from '@/lib/album/parse-filename';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function defaultAlbumRoot(): string {
  return path.join(process.cwd(), 'album');
}

export function localAudioDir(albumRoot: string = defaultAlbumRoot()): string {
  return path.join(albumRoot, 'audio');
}

export function isAlbumSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export function isSafeAudioFilename(value: string): boolean {
  if (value !== path.basename(value)) {
    return false;
  }
  if (value.includes('..') || value.includes('/') || value.includes('\\')) {
    return false;
  }
  return isAudioFilename(value);
}

export function isInsideDir(filePath: string, dir: string): boolean {
  const relative = path.relative(dir, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function resolveAudioCandidates(args: { albumRoot: string; filename: string }): string[] {
  if (!isSafeAudioFilename(args.filename)) {
    return [];
  }

  const audioDir = path.resolve(localAudioDir(args.albumRoot));
  const candidate = path.resolve(audioDir, args.filename);
  return isInsideDir(candidate, audioDir) ? [candidate] : [];
}

export function blobPathnameFor(filename: string): string | null {
  if (!isSafeAudioFilename(filename)) {
    return null;
  }

  return `takes/${filename}`;
}

export function resolveAudioFile(args: { albumRoot: string; filename: string }): string | null {
  return resolveAudioCandidates(args)[0] ?? null;
}
