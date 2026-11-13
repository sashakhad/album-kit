import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  exportPreset,
  importPreset,
  resolveSettings,
  settingsPatchSchema,
  settingsSchema,
} from '../schema';

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
      listenerVoting: false,
      preset: 'imported',
      generationCreditLimit: 100,
    });
    expect(importPreset(preset)).not.toHaveProperty('authorization');
    const exported = exportPreset({
      ...DEFAULT_SETTINGS,
      listenerVoting: true,
      visibility: 'public',
    });
    expect(JSON.stringify(exported)).not.toContain('listenerVoting');
    expect(exported.settings).not.toHaveProperty('listenerVoting');
  });

  it('keeps omitted fields out of a partial patch', () => {
    expect(settingsPatchSchema.parse({ listenerVoting: true })).toEqual({ listenerVoting: true });
    expect(settingsPatchSchema.parse({ visibility: 'public' })).toEqual({ visibility: 'public' });
  });

  it('defaults review takes to public and leaves that choice out of a portable preset', () => {
    expect(DEFAULT_SETTINGS.reviewTakes).toBe('public');
    const legacy: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    delete legacy.reviewTakes;
    expect(settingsSchema.parse(legacy).reviewTakes).toBe('public');
    expect(settingsPatchSchema.parse({ reviewTakes: 'private' })).toEqual({
      reviewTakes: 'private',
    });
    const preset = exportPreset({ ...DEFAULT_SETTINGS, reviewTakes: 'private' });
    expect(preset.settings).not.toHaveProperty('reviewTakes');
    expect(importPreset(preset)).not.toHaveProperty('reviewTakes');
  });

  it('rejects credentials and unsupported versions', () => {
    const preset = exportPreset(DEFAULT_SETTINGS);
    expect(() => importPreset({ ...preset, token: 'secret' })).toThrow();
    expect(() => importPreset({ ...preset, version: 999 })).toThrow();
  });
});
