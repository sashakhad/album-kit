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
  it('shows prompt models by default and can persist a mask', () => {
    expect(DEFAULT_SETTINGS.maskPromptModels).toBe(false);
    expect(settingsPatchSchema.parse({ maskPromptModels: true })).toEqual({
      maskPromptModels: true,
    });
    expect(
      exportPreset({ ...DEFAULT_SETTINGS, maskPromptModels: true }).settings.maskPromptModels
    ).toBe(true);
  });
  it('keeps prompt writer requests and Suno choices in each album preset', () => {
    const preset = exportPreset({
      ...DEFAULT_SETTINGS,
      promptWriter: 'cursor',
      promptWriterModel: 'auto',
      sunoModel: 'v6-mini',
    });
    expect(importPreset(preset)).toMatchObject({
      promptWriter: 'cursor',
      promptWriterModel: 'auto',
      sunoModel: 'v6-mini',
    });
  });
  it('resolves album overrides over user defaults', () => {
    const stored = {
      version: 1,
      defaults: { ...DEFAULT_SETTINGS, promptVariations: 5 },
      overrides: { promptVariations: 2 },
    };
    expect(resolveSettings(stored).promptVariations).toBe(2);
  });

  it('omits listener voting from a portable preset', () => {
    const preset = exportPreset({
      ...DEFAULT_SETTINGS,
      generationCreditLimit: 100,
    });
    expect(importPreset(preset)).toMatchObject({
      listenerVoting: false,
      preset: 'imported',
      generationCreditLimit: 100,
    });
    expect(importPreset(preset)).not.toHaveProperty('authorization');
    const exported = exportPreset({
      ...DEFAULT_SETTINGS,
      listenerVoting: true,
    });
    expect(JSON.stringify(exported)).not.toContain('listenerVoting');
    expect(exported.settings).not.toHaveProperty('listenerVoting');
  });

  it('keeps omitted fields out of a partial patch', () => {
    expect(settingsPatchSchema.parse({ listenerVoting: true })).toEqual({ listenerVoting: true });
  });

  it('starts More takes with a 50 credit allowance that stays out of a portable preset', () => {
    expect(DEFAULT_SETTINGS.variationCreditAllowance).toBe(50);
    expect(exportPreset(DEFAULT_SETTINGS).settings).not.toHaveProperty('variationCreditAllowance');
    expect(settingsPatchSchema.parse({ variationCreditAllowance: 0 })).toEqual({
      variationCreditAllowance: 0,
    });
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
