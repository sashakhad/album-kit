import { describe, expect, it } from 'vitest';

import { formatChatLines } from '../../../scripts/album-owner.mjs';

describe('owner chat lines', () => {
  it('prints the site and the owner link without the album key', () => {
    const siteUrl = 'https://album.example';
    const ownerLink = 'https://album.example/key?next=%2Fvote#owner=abc';
    const text = formatChatLines({
      siteUrl,
      progressLine: 'Round 1: 36/90 done, 72 of 180 takes ready.',
      ownerLink,
    });

    expect(text).toBe(
      `Round 1: 36/90 done, 72 of 180 takes ready.\nSite: ${siteUrl}\nOwner: ${ownerLink}\n`
    );
    expect(text).not.toContain('album-key');
    expect(text).not.toContain('ALBUM_KEY');
  });

  it('can print the site alone', () => {
    expect(formatChatLines({ siteUrl: 'https://album.example' })).toBe(
      'Site: https://album.example\n'
    );
  });
});
