import type { AlbumConfig, AlbumConfigTrack } from '@/lib/album/album-config';
import { parseCanonicalTake } from '@/lib/album/parse-filename';
import { takeDisplayLabel } from '@/lib/album/take-label';
import { voteHref } from '@/lib/album/play-path';
import { resolveTrack } from '@/lib/album/play-path';
import type { AlbumTake, AlbumTrack, AlbumVersion } from '@/lib/album/types';
import type { TakeTallies } from '@/lib/votes/types';

export const LISTEN_SLUG = 'listen';

type Pin = {
  set: string;
  take: string;
};

export type ListenSelectionValue = {
  trackNumber: number;
  slot: string;
  setId: string | null;
  takeLabel: string | null;
};

export function applyListenSelections(
  config: AlbumConfig,
  selections: readonly ListenSelectionValue[]
): AlbumConfig {
  const byTrack = new Map<number, AlbumConfigTrack>();
  for (const track of config.tracks) byTrack.set(track.number, { ...track });
  for (const selection of selections) {
    const track = byTrack.get(selection.trackNumber);
    if (track === undefined) continue;
    const pin =
      selection.setId === null || selection.takeLabel === null
        ? undefined
        : { set: selection.setId, take: selection.takeLabel };
    if (selection.slot === 'main') track.listen = pin;
    if (selection.slot === 'vip') {
      track.vip = pin === undefined ? undefined : { ...pin, title: track.vip?.title };
    }
  }
  return { ...config, tracks: config.tracks.map(track => byTrack.get(track.number) ?? track) };
}

export function listenVipTitle(track: AlbumConfigTrack): string {
  return track.vip?.title ?? `${track.title} (VIP)`;
}

export function rankListenTakes(takes: readonly AlbumTake[], scores: TakeTallies) {
  const score = (take: AlbumTake) => scores[take.label] ?? 0;
  const ordered = [...takes].sort((a, b) => score(b) - score(a));
  const highest = ordered[0] === undefined ? 0 : score(ordered[0]);
  const winners = highest > 0 ? ordered.filter(take => score(take) === highest) : [];
  return { ordered, winners };
}

export function buildListenVersion(args: {
  config: AlbumConfig;
  versions: readonly AlbumVersion[];
  defaults?: ReadonlyMap<number, readonly AlbumTake[]>;
}): AlbumVersion {
  const tracks: AlbumTrack[] = [];

  for (const configTrack of args.config.tracks) {
    if (configTrack.parked === true) continue;
    const manual = configTrack.listen;
    const picked =
      manual === undefined ? null : pinnedTake(args.versions, configTrack.number, manual);
    const takes =
      manual === undefined
        ? (args.defaults?.get(configTrack.number) ?? [])
        : picked === null
          ? []
          : [picked];
    if (takes.length === 0) continue;

    for (const [index, take] of takes.entries()) {
      const title =
        takes.length === 1 ? configTrack.title : `${configTrack.title} (Version ${index + 1})`;
      tracks.push({
        ...trackWithTake(configTrack.number, title, take),
        listenSlug: index === 0 ? configTrack.slug : `${configTrack.slug}~${index + 1}`,
        status: 'picked',
      });
    }

    if (configTrack.vip === undefined) {
      continue;
    }
    const vip = pinnedTake(args.versions, configTrack.number, configTrack.vip);
    if (
      vip !== null &&
      (manual !== undefined || !takes.some(take => take.filename === vip.filename))
    ) {
      tracks.push({
        ...trackWithTake(configTrack.number, listenVipTitle(configTrack), vip),
        listenSlug: `${configTrack.slug}-vip`,
        status: 'picked',
      });
    }
  }

  return {
    slug: LISTEN_SLUG,
    folder: LISTEN_SLUG,
    title: args.config.title,
    author: args.config.artist,
    blurb: '',
    tracks: numberListenTracks(tracks),
  };
}

export function findListenTrack(args: {
  listen: AlbumVersion;
  config: AlbumConfig;
  trackSlug: string;
}): AlbumTrack | null {
  for (const configTrack of args.config.tracks) {
    if (configTrack.slug === args.trackSlug) {
      return trackByTitle(args.listen, configTrack.title);
    }
    if (configTrack.vip !== undefined && `${configTrack.slug}-vip` === args.trackSlug) {
      return trackByTitle(args.listen, listenVipTitle(configTrack));
    }
  }
  return resolveTrack(args.trackSlug, args.listen.tracks);
}

export function isListenFile(config: AlbumConfig, setId: string, filename: string): boolean {
  const take = parseCanonicalTake(filename);
  if (take === null || take.setId !== setId) {
    return false;
  }

  const track = config.tracks.find(item => item.number === take.trackNumber);
  if (track === undefined || track.parked === true) {
    return false;
  }

  for (const pin of [track.listen, track.vip]) {
    if (pin !== undefined && pin.set === setId && pin.take === take.letter) {
      return true;
    }
  }
  return false;
}

function pinnedTake(
  versions: readonly AlbumVersion[],
  trackNumber: number,
  pin: Pin
): AlbumTake | null {
  const version = versions.find(item => item.slug === pin.set);
  const track = version?.tracks.find(item => item.kind === 'album' && item.number === trackNumber);
  const take = track?.takes.find(item => item.voteLabel === pin.take);
  if (version === undefined || take === undefined) {
    return null;
  }
  return {
    label: takeDisplayLabel(
      versions
        .flatMap(
          item =>
            item.tracks.find(row => row.kind === 'album' && row.number === trackNumber)?.takes ?? []
        )
        .findIndex(item => item.filename === take.filename)
    ),
    filename: take.filename,
    audioUrl: take.audioUrl,
    versionSlug: take.versionSlug,
    voteLabel: take.voteLabel,
  };
}

function trackWithTake(number: number, title: string, take: AlbumTake): AlbumTrack {
  const { label, filename, audioUrl, versionSlug, voteLabel } = take;
  return {
    number,
    title,
    kind: 'album',
    filename,
    audioUrl,
    takes: [{ label, filename, audioUrl, versionSlug, voteLabel }],
    parkedTakes: [],
    prompt: null,
  };
}

function numberListenTracks(tracks: readonly AlbumTrack[]): AlbumTrack[] {
  const numbered: AlbumTrack[] = [];
  for (const track of tracks) {
    numbered.push({
      ...track,
      number: numbered.length + 1,
    });
  }
  return numbered;
}

function trackByTitle(listen: AlbumVersion, title: string): AlbumTrack | null {
  return listen.tracks.find(track => track.title === title) ?? null;
}

/** Published choices take priority over previews and waiting tracks. */
export function buildListeningQueue(
  config: AlbumConfig,
  pinned: AlbumVersion,
  preview: AlbumVersion | null
): AlbumVersion {
  const tracks: AlbumTrack[] = [];
  for (const item of config.tracks.filter(track => track.parked !== true)) {
    const selected = pinned.tracks.filter(
      track => track.listenSlug === item.slug || track.listenSlug?.startsWith(`${item.slug}~`)
    );
    const current = preview?.tracks.find(track => track.number === item.number);
    const compareHref =
      preview === null || current?.takes.length === 0 || current === undefined
        ? undefined
        : voteHref({ title: item.title });
    const first = current?.takes[0];
    const fallback: AlbumTrack = {
      number: item.number,
      title: item.title,
      kind: 'album',
      takes: first === undefined ? [] : [first],
      parkedTakes: [],
      filename: first?.filename ?? null,
      audioUrl: first?.audioUrl ?? null,
      prompt: null,
      status: first === undefined ? 'waiting' : 'preview',
      listenSlug: item.slug,
    };
    for (const choice of selected.length === 0 ? [fallback] : selected) {
      const details = current?.takes.find(take => take.filename === choice.filename);
      tracks.push({
        ...choice,
        ...(compareHref === undefined ? {} : { compareHref }),
        ...(details === undefined ? {} : { takes: [details], audioUrl: details.audioUrl }),
      });
    }
    const vip = pinned.tracks.find(track => track.listenSlug === `${item.slug}-vip`);
    if (vip !== undefined) tracks.push(vip);
  }
  return { ...pinned, tracks: numberListenTracks(tracks) };
}
