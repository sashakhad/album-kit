import type { AlbumSettingsValue } from '@/lib/settings/schema';

export function canViewAlbum(
  visibility: AlbumSettingsValue['visibility'],
  owner: boolean,
  viewer = false
): boolean {
  return owner || visibility === 'public' || (visibility === 'private' && viewer);
}
