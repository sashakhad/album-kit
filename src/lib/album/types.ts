export type VersionMeta = {
  title: string;
  author: string;
  blurb: string;
  publicSlug: string | null;
  albumSlug?: string | null;
};

export type AlbumTake = {
  label: string;
  filename: string;
  audioUrl: string;
  versionSlug: string;
  voteLabel: string;
  prompt?: string;
  details?: {
    style: string;
    writer: string;
    sunoModel: string;
    promptSource?: 'generation' | 'sheet' | 'unavailable';
    parentTakeFilename?: string;
    promptInstructions?: string;
  };
};

export type AlbumTrack = {
  number: number;
  title: string;
  kind: 'album' | 'bonus';
  filename: string | null;
  audioUrl: string | null;
  takes: AlbumTake[];
  parkedTakes?: AlbumTake[];
  parked?: boolean;
  prompt: string | null;
  videoUrl?: string | null;
  status?: 'preview' | 'picked' | 'waiting';
  listenSlug?: string;
  compareHref?: string;
};

export type AlbumVersion = {
  slug: string;
  folder: string;
  title: string;
  author: string;
  blurb: string;
  albumSlug?: string;
  tracks: AlbumTrack[];
};

export type AlbumVersionSummary = {
  slug: string;
  title: string;
  author: string;
  blurb: string;
  trackCount: number;
  readyCount: number;
};

export function summarizeVersion(version: AlbumVersion): AlbumVersionSummary {
  let readyCount = 0;
  for (const track of version.tracks) {
    if (track.audioUrl !== null) {
      readyCount += 1;
    }
  }

  return {
    slug: version.slug,
    title: version.title,
    author: version.author,
    blurb: version.blurb,
    trackCount: version.tracks.length,
    readyCount,
  };
}

export function audioUrlFor(slug: string, filename: string): string {
  return `/api/audio/${encodeURIComponent(slug)}/${encodeURIComponent(filename)}`;
}
