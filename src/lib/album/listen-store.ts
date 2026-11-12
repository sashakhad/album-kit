import 'server-only';

import { createHmac } from 'node:crypto';
import { cache } from 'react';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { applyListenSelections, buildListenVersion, rankListenTakes } from '@/lib/album/listen';
import { listenerAudioUrl } from '@/lib/album/stream-url';
import type { AlbumVersion } from '@/lib/album/types';
import { albumKey, OWNER_VISITOR_ID } from '@/lib/owner/auth';
import { getPrisma } from '@/lib/prisma';
import { votesForCurrentPass } from '@/lib/votes/pass';
import { getConsolidatedPass } from '@/lib/votes/pass-store';

export const getListenConfig = cache(async function getListenConfig() {
  const [config, selections] = await Promise.all([
    loadAlbumConfig(),
    getPrisma().listenSelection.findMany(),
  ]);
  return applyListenSelections(config, selections);
});

export const getListenVersion = cache(async function getListenVersion(): Promise<AlbumVersion> {
  const [config, pass] = await Promise.all([
    getListenConfig(),
    getConsolidatedPass(OWNER_VISITOR_ID),
  ]);
  const scores = new Map(
    votesForCurrentPass(pass.votes, pass.currentRound).map(vote => [
      `${vote.trackNumber}:${vote.versionSlug}:${vote.takeLabel}`,
      vote.value,
    ])
  );
  const defaults = new Map(
    pass.version.tracks.map(track => {
      const byLabel = Object.fromEntries(
        track.takes.map(take => [
          take.label,
          scores.get(`${track.number}:${take.versionSlug}:${take.voteLabel}`) ?? 0,
        ])
      );
      return [track.number, rankListenTakes(track.takes, byLabel).winners];
    })
  );
  return buildListenVersion({ config, versions: pass.versions, defaults });
});

export function listenAudioToken(key: string, filename: string): string {
  return createHmac('sha256', key).update(`listen-audio-v1:${filename}`).digest('hex').slice(0, 32);
}

export function withPublishedPlayback(version: AlbumVersion): AlbumVersion {
  const key = albumKey();
  if (key === null) return version;
  return {
    ...version,
    tracks: version.tracks.map(track => {
      const take = track.takes[0];
      if (track.status !== 'picked' || take === undefined) return track;
      const token = listenAudioToken(key, take.filename);
      const audioUrl = listenerAudioUrl(take.audioUrl, `/api/listen-audio/${token}`);
      return {
        ...track,
        filename: token,
        audioUrl,
        takes: [
          { ...take, filename: token, audioUrl, versionSlug: 'listen', voteLabel: take.label },
        ],
      };
    }),
  };
}
