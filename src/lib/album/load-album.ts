import 'server-only';

import { promises as fs, type Dirent } from 'node:fs';

import { loadAlbumConfig, type AlbumConfig } from '@/lib/album/album-config';
import { canUseBlob, listBlobTakeFilenames } from '@/lib/album/blob-audio';
import { buildVersion, type CanonicalTrack } from '@/lib/album/build-version';
import { isAudioFilename } from '@/lib/album/parse-filename';
import { localAudioDir } from '@/lib/album/paths';
import type { AlbumVersion } from '@/lib/album/types';

const SET_PREFIX = /^(v\d+)-/;

export async function listSets(): Promise<AlbumVersion[]> {
  const config = await loadAlbumConfig();
  const filenames = canUseBlob() ? await listBlobTakeFilenames() : await listLocalTakeFilenames();
  return buildSets(config, filenames);
}

export async function getSet(id: string): Promise<AlbumVersion | null> {
  const sets = await listSets();
  return sets.find(set => set.slug === id) ?? null;
}

export function albumTracklist(config: AlbumConfig): CanonicalTrack[] {
  const tracklist: CanonicalTrack[] = [];
  for (const track of config.tracks) {
    if (track.parked === true) {
      continue;
    }
    tracklist.push({ number: track.number, title: track.title, slug: track.slug });
  }
  return tracklist;
}

function buildSets(config: AlbumConfig, filenames: readonly string[]): AlbumVersion[] {
  const filesBySet = new Map<string, string[]>();
  for (const set of config.sets) {
    filesBySet.set(set.id, []);
  }

  for (const filename of filenames) {
    const setId = SET_PREFIX.exec(filename)?.[1];
    if (setId === undefined) {
      continue;
    }
    filesBySet.get(setId)?.push(filename);
  }

  const tracklist = albumTracklist(config);
  const versions: AlbumVersion[] = [];
  for (const set of config.sets) {
    versions.push(
      buildVersion({
        folder: set.id,
        meta: {
          title: set.name,
          author: set.name,
          blurb: set.blurb ?? '',
          publicSlug: set.id,
        },
        audioFiles: filesBySet.get(set.id) ?? [],
        prompts: new Map(),
        tracklist,
      })
    );
  }
  return versions;
}

async function listLocalTakeFilenames(): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(localAudioDir(), { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const filenames: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && !entry.name.startsWith('.') && isAudioFilename(entry.name)) {
      filenames.push(entry.name);
    }
  }
  return filenames;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
