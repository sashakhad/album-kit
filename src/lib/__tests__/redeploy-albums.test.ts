// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { parseDeployHooks, redeployAlbums } from '../../../scripts/redeploy-albums.mjs';

const hook = 'https://api.vercel.com/v1/integrations/deploy/prj_album/abc123';

describe('album deploy hooks', () => {
  it('skips when no hook is configured and does not call the network', async () => {
    const request = vi.fn();
    await expect(redeployAlbums({}, request)).resolves.toEqual({ triggered: 0 });
    await expect(redeployAlbums({ ALBUM_DEPLOY_HOOKS: '  \n' }, request)).resolves.toEqual({
      triggered: 0,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('posts each Vercel deploy hook and hides the URL', async () => {
    const request = vi.fn(async () => new Response('', { status: 201 }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const second = 'https://api.vercel.com/v1/integrations/deploy/prj_other/def456';
    await expect(
      redeployAlbums({ ALBUM_DEPLOY_HOOKS: `${hook}\n${second}` }, request)
    ).resolves.toEqual({ triggered: 2 });
    expect(request).toHaveBeenNthCalledWith(1, hook, { method: 'POST' });
    expect(request).toHaveBeenNthCalledWith(2, second, { method: 'POST' });
    expect(log.mock.calls.flat().join('\n')).not.toContain(hook);
    expect(log.mock.calls.flat().join('\n')).toContain('Triggered 2');
    log.mockRestore();
  });

  it('rejects a GitHub token or any URL that is not a Vercel deploy hook', () => {
    expect(() => parseDeployHooks('ghp_secret')).toThrow(/api\.vercel\.com/);
    expect(() => parseDeployHooks('https://github.com/sashakhad/album-kit')).toThrow(
      /api\.vercel\.com/
    );
    expect(() => parseDeployHooks('http://api.vercel.com/v1/integrations/deploy/prj/hook')).toThrow(
      /api\.vercel\.com/
    );
  });

  it('fails when a configured hook does not accept the deploy', async () => {
    const request = vi.fn(async () => new Response('no', { status: 404 }));
    await expect(redeployAlbums({ ALBUM_DEPLOY_HOOKS: hook }, request)).rejects.toThrow(/404/);
  });

  it('keeps the kit workflow on deploy hooks and off a GitHub token', () => {
    const workflow = readFileSync(
      path.join(process.cwd(), '.github/workflows/redeploy-albums.yml'),
      'utf8'
    );
    expect(workflow).toContain('ALBUM_DEPLOY_HOOKS');
    expect(workflow).not.toMatch(/ALBUM_SYNC_TOKEN|GITHUB_TOKEN|ghp_|personal access/i);
  });
});
