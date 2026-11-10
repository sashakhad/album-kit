import 'server-only';

import { cache } from 'react';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { applyListenSelections, buildListenVersion } from '@/lib/album/listen';
import { listSets } from '@/lib/album/load-album';
import type { AlbumVersion } from '@/lib/album/types';
import { getPrisma } from '@/lib/prisma';

export const getListenConfig = cache(async function getListenConfig() {
  const [config, selections] = await Promise.all([
    loadAlbumConfig(),
    getPrisma().listenSelection.findMany(),
  ]);
  return applyListenSelections(config, selections);
});

export const getListenVersion = cache(async function getListenVersion(): Promise<AlbumVersion> {
  const [config, versions] = await Promise.all([getListenConfig(), listSets()]);
  return buildListenVersion({ config, versions });
});
