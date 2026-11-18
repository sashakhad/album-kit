import type { AlbumVersion } from '@/lib/album/types';

export type ListenShellPayload = {
  title: string;
  artist: string;
  blurb: string;
  version: AlbumVersion;
};
