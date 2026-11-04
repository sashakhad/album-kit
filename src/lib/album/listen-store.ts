import 'server-only';

import { cache } from 'react';

import { loadAlbumConfig } from '@/lib/album/album-config';
import { buildListenVersion } from '@/lib/album/listen';
import { listSets } from '@/lib/album/load-album';
import type { AlbumVersion } from '@/lib/album/types';

export const getListenVersion = cache(async function getListenVersion(): Promise<AlbumVersion> {
  const [config, versions] = await Promise.all([loadAlbumConfig(), listSets()]);
  return buildListenVersion({ config, versions });
});
