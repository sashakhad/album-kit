import { parseTakeLabel, parseTrackNumber, titleFromFilename } from '@/lib/album/parse-filename';
import {
  audioUrlFor,
  type AlbumTake,
  type AlbumTrack,
  type AlbumVersion,
  type VersionMeta,
} from '@/lib/album/types';

export type CanonicalTrack = {
  number: number;
  title: string;
  slug?: string;
  parked?: boolean;
};

export function buildVersion(args: {
  folder: string;
  meta: VersionMeta;
  audioFiles: string[];
  prompts: Map<number, string>;
  tracklist: CanonicalTrack[];
}): AlbumVersion {
  const albumSlug = args.meta.albumSlug ?? null;
  const tracklist = args.tracklist;
  const publicSlug = args.meta.publicSlug ?? args.folder;
  const sortedFiles = [...args.audioFiles].sort((left, right) => left.localeCompare(right));
  const usedFiles = new Set<string>();
  const tracks: AlbumTrack[] = [];

  for (const canonical of tracklist) {
    const takes = collectTakes({
      slug: publicSlug,
      audioFiles: sortedFiles,
      usedFiles,
      trackNumber: canonical.number,
    });
    const first = takes[0];

    tracks.push({
      number: canonical.number,
      title: canonical.title,
      kind: 'album',
      filename: first?.filename ?? null,
      audioUrl: first?.audioUrl ?? null,
      takes,
      ...(canonical.parked === true ? { parked: true } : {}),
      prompt: args.prompts.get(canonical.number) ?? null,
    });
  }

  let bonusNumber = tracklist.length;
  for (const filename of sortedFiles) {
    if (usedFiles.has(filename)) {
      continue;
    }

    bonusNumber += 1;
    const take = takeFromFile({ slug: publicSlug, filename, label: 'A' });
    tracks.push({
      number: bonusNumber,
      title: titleFromFilename(filename),
      kind: 'bonus',
      filename,
      audioUrl: take.audioUrl,
      takes: [take],
      prompt: null,
    });
  }

  return {
    slug: publicSlug,
    folder: args.folder,
    title: args.meta.title,
    author: args.meta.author,
    blurb: args.meta.blurb,
    ...(albumSlug === null ? {} : { albumSlug }),
    tracks,
  };
}

function collectTakes(args: {
  slug: string;
  audioFiles: string[];
  usedFiles: Set<string>;
  trackNumber: number;
}): AlbumTake[] {
  const matching: string[] = [];

  for (const filename of args.audioFiles) {
    if (args.usedFiles.has(filename)) {
      continue;
    }
    if (parseTrackNumber(filename) !== args.trackNumber) {
      continue;
    }
    args.usedFiles.add(filename);
    matching.push(filename);
  }

  matching.sort((left, right) => left.localeCompare(right));

  const usedLabels = new Set<string>();
  const takes: AlbumTake[] = [];

  for (const filename of matching) {
    const parsed = parseTakeLabel(filename);
    const label = parsed !== null && !usedLabels.has(parsed) ? parsed : nextUnusedLabel(usedLabels);
    usedLabels.add(label);
    takes.push(takeFromFile({ slug: args.slug, filename, label }));
  }

  takes.sort((left, right) => left.label.localeCompare(right.label));
  return takes;
}

function nextUnusedLabel(usedLabels: Set<string>): string {
  for (let index = 0; index < 26; index += 1) {
    const label = String.fromCharCode(65 + index);
    if (!usedLabels.has(label)) {
      return label;
    }
  }

  return String(usedLabels.size + 1);
}

function takeFromFile(args: { slug: string; filename: string; label: string }): AlbumTake {
  return {
    label: args.label,
    filename: args.filename,
    audioUrl: audioUrlFor(args.slug, args.filename),
    versionSlug: args.slug,
    voteLabel: args.label,
  };
}
