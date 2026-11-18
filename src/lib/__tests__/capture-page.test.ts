import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { CAPTURE_TIMEOUT_SECONDS, captureAlbumPage } from '../../../scripts/capture-page.mjs';

it('returns the page without waiting on Chrome', () => {
  const source = readFileSync(path.resolve('scripts/capture-page.mjs'), 'utf8');
  expect(CAPTURE_TIMEOUT_SECONDS).toBeLessThanOrEqual(3);
  expect(source).toContain('detached: true');
  expect(source).not.toContain('20_000');
  expect(source).not.toContain('timeout: 20000');
  const started = performance.now();
  expect(captureAlbumPage('/tmp/Open Album.html', '/tmp/Album page.png')).toBeNull();
  expect(performance.now() - started).toBeLessThan(50);
});
