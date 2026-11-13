import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  exportPreset,
  importPreset,
  resolveSettings,
  settingsPatchSchema,
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

  it('rejects credentials and unsupported versions', () => {
    const preset = exportPreset(DEFAULT_SETTINGS);
    expect(() => importPreset({ ...preset, token: 'secret' })).toThrow();
    expect(() => importPreset({ ...preset, version: 999 })).toThrow();
  });
});
