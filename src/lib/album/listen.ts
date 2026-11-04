import type { AlbumConfig, AlbumConfigTrack } from '@/lib/album/album-config';
import { parseCanonicalTake } from '@/lib/album/parse-filename';
import { resolveTrack } from '@/lib/album/play-path';
import type { AlbumTake, AlbumTrack, AlbumVersion } from '@/lib/album/types';

export const LISTEN_SLUG = 'listen';

type Pin = {
  set: string;
  take: string;
};

export function listenVipTitle(track: AlbumConfigTrack): string {
  return track.vip?.title ?? `${track.title} (VIP)`;
}

export function buildListenVersion(args: {
  config: AlbumConfig;
  versions: readonly AlbumVersion[];
}): AlbumVersion {
  const tracks: AlbumTrack[] = [];

  for (const configTrack of args.config.tracks) {
    if (configTrack.parked === true || configTrack.listen === undefined) {
      continue;
    }

    const main = pinnedTake(args.versions, configTrack.number, configTrack.listen);
    if (main === null) {
      continue;
    }
    tracks.push(trackWithTake(configTrack.number, configTrack.title, main));

    if (configTrack.vip === undefined) {
      continue;
    }
    const vip = pinnedTake(args.versions, configTrack.number, configTrack.vip);
    if (vip !== null) {
      tracks.push(trackWithTake(configTrack.number, listenVipTitle(configTrack), vip));
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
  return { ...take, label: `${version.title} ${take.voteLabel}` };
}

function trackWithTake(number: number, title: string, take: AlbumTake): AlbumTrack {
  return {
    number,
    title,
    kind: 'album',
    filename: take.filename,
    audioUrl: take.audioUrl,
    takes: [take],
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
