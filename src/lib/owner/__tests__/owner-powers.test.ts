// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { POST as postDownload } from '@/app/api/downloads/route';
import { POST as postPass } from '@/app/api/pass/route';
import { PATCH as patchSettings } from '@/app/api/owner/settings/route';
import { POST as postMove } from '@/app/api/owner/takes/move/route';

describe('owner powers stay behind the album key', () => {
  it('rejects a listener on pass, downloads, settings, and moves', async () => {
    vi.stubEnv('ALBUM_KEY', 'dev-owner-key');
    const headers = { 'Content-Type': 'application/json' };
    expect(
      (
        await postPass(
          new Request('http://localhost/api/pass', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'next' }),
          })
        )
      ).status
    ).toBe(401);
    expect(
      (
        await postDownload(
          new Request('http://localhost/api/downloads', {
            method: 'POST',
            headers,
            body: JSON.stringify({ trackNumber: 1, versionSlug: 'v1', takeLabel: 'A' }),
          })
        )
      ).status
    ).toBe(401);
    expect(
      (
        await patchSettings(
          new Request('http://localhost/api/owner/settings', {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ patch: { listenerVoting: true } }),
          })
        )
      ).status
    ).toBe(401);
    expect(
      (
        await postMove(
          new Request('http://localhost/api/owner/takes/move', {
            method: 'POST',
            headers,
            body: JSON.stringify({ from: 'a.mp3', to: 'b.mp3' }),
          })
        )
      ).status
    ).toBe(401);
    vi.unstubAllEnvs();
  });
});
