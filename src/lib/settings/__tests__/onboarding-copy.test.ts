import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('playbook onboarding', () => {
  it('keeps the review-take choice in the setup playbook', () => {
    const output = execFileSync('node', ['scripts/check-playbook.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(output).toContain('check-playbook: ok');
  });
});
