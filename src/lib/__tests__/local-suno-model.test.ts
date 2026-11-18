// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { selectRoundModel } from '../../../scripts/suno-model.mjs';

let root: string;
let facts: { availableModels: string[]; qualityDefault: string | null; checkedAt: string };
const script = path.join(process.cwd(), 'scripts/suno-model.mjs');
const setPath = (setup: string) =>
  writeFileSync(path.join(root, '.album-onboarding.json'), JSON.stringify({ path: setup }));
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'suno-round-'));
  facts = {
    availableModels: ['v6', 'v6-mini'],
    qualityDefault: 'v6',
    checkedAt: new Date().toISOString(),
  };
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('passes the live eligible Mini model to a first Lite generation and keeps that model after restart', () => {
  setPath('lite');
  const file = path.join(root, 'capabilities.json');
  writeFileSync(file, JSON.stringify(facts));
  const plan = () =>
    JSON.parse(
      execFileSync(process.execPath, [script, 'round-001', file], { cwd: root, encoding: 'utf8' })
    );
  expect(plan()).toMatchObject({ model: 'v6-mini', generationSettings: { model: 'v6-mini' } });
  setPath('full');
  expect(plan().model).toBe('v6-mini');
  expect(selectRoundModel(root, 'round-002', facts).model).toBe('v6');
});

it('only selects eligible models and honors saved, overridden and previously authorized choices', () => {
  setPath('light');
  expect(selectRoundModel(root, 'only', { ...facts, availableModels: ['v6'] }).model).toBe('v6');
  expect(
    selectRoundModel(root, 'other', {
      ...facts,
      availableModels: ['new-a', 'new-b'],
      qualityDefault: null,
    }).model
  ).toBe('new-a');
  expect(selectRoundModel(root, 'pinned', { ...facts, sunoModel: 'v6' }).model).toBe('v6');
  expect(
    selectRoundModel(root, 'override', { ...facts, sunoModel: 'v6-mini', sunoModelOverride: 'v6' })
      .model
  ).toBe('v6');
  expect(selectRoundModel(root, 'prior-ledger', { ...facts, resolvedSunoModel: 'v6' }).model).toBe(
    'v6'
  );
  expect(() => selectRoundModel(root, 'retired', { ...facts, sunoModel: 'unavailable' })).toThrow(
    /unavailable/
  );
  expect(() =>
    selectRoundModel(root, 'pinned', { ...facts, availableModels: ['v6-mini'] })
  ).toThrow(/no longer available/);
  expect(() =>
    selectRoundModel(root, 'pinned', { ...facts, resolvedSunoModel: 'v6-mini' })
  ).toThrow(/receipt/);
  expect(() => selectRoundModel(root, 'undated', { ...facts, checkedAt: 'invalid' })).toThrow(
    /Record when/
  );
});

it('preserves the quality default and existing ambiguous-model block on Full and legacy paths', () => {
  for (const setup of ['full', 'studio', 'quick']) {
    setPath(setup);
    expect(selectRoundModel(root, setup, facts).model).toBe('v6');
    expect(() =>
      selectRoundModel(root, `${setup}-undecided`, { ...facts, qualityDefault: null })
    ).toThrow(/quality default/);
  }
});
