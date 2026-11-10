import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, exportPreset, importPreset, resolveSettings } from '../schema';

describe('settings and portable presets', () => {
  it('resolves album overrides over user defaults', () => {
    const stored = {
      version: 1,
      defaults: { ...DEFAULT_SETTINGS, promptVariations: 5 },
      overrides: { promptVariations: 2 },
    };
    expect(resolveSettings(stored).promptVariations).toBe(2);
  });

  it('omits publication and approvals from a preset and resets publication on import', () => {
    const preset = exportPreset({
      ...DEFAULT_SETTINGS,
      visibility: 'private',
      generationCreditLimit: 100,
    });
    expect(preset).not.toHaveProperty('visibility');
    expect(JSON.stringify(preset)).not.toContain('private');
    expect(importPreset(preset)).toMatchObject({
      visibility: 'unset',
      preset: 'imported',
      generationCreditLimit: 100,
    });
    expect(importPreset(preset)).not.toHaveProperty('authorization');
  });

  it('rejects credentials and unsupported versions', () => {
    const preset = exportPreset(DEFAULT_SETTINGS);
    expect(() => importPreset({ ...preset, token: 'secret' })).toThrow();
    expect(() => importPreset({ ...preset, version: 999 })).toThrow();
  });
});
