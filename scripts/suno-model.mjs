#!/usr/bin/env node
// Pin the Suno model before authorizing a local round. This command never submits a Create.
import { createHash } from 'node:crypto';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSunoModel } from '../src/lib/rounds/suno-model.ts';

function read(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function selectRoundModel(root, roundId, facts) {
  if (typeof roundId !== 'string' || !roundId.trim() || roundId.length > 200) {
    throw new Error('Use the existing round ID from the album ledger.');
  }
  if (
    !Array.isArray(facts?.availableModels) ||
    !facts.availableModels.length ||
    facts.availableModels.some(model => typeof model !== 'string' || !model.trim()) ||
    !(facts.qualityDefault === null || typeof facts.qualityDefault === 'string')
  ) {
    throw new Error('Check the eligible Suno models and quality default on this account.');
  }
  if (!Number.isFinite(Date.parse(facts.checkedAt))) {
    throw new Error('Record when the Suno account reported these models.');
  }
  for (const field of ['sunoModel', 'sunoModelOverride', 'resolvedSunoModel']) {
    if (facts[field] !== undefined && (typeof facts[field] !== 'string' || !facts[field].trim())) {
      throw new Error('Use the model ID returned by Suno.');
    }
  }
  const directory = path.join(root, '.tmp', 'album-preview-models');
  const filename = path.join(
    directory,
    createHash('sha256').update(roundId).digest('hex') + '.json'
  );
  let saved = read(filename);
  if (saved === null) {
    const setupPath = read(path.join(root, '.album-onboarding.json'))?.path;
    const policy = facts.resolvedSunoModel ?? facts.sunoModelOverride ?? facts.sunoModel ?? 'auto';
    const { model, migration, needsChoice } = resolveSunoModel(policy, facts, setupPath);
    if (migration) throw new Error(`Suno model ${policy} is unavailable on this account.`);
    if (needsChoice)
      throw new Error('Choose an eligible Suno model or verify the account’s quality default.');
    mkdirSync(directory, { recursive: true });
    const pending = mkdtempSync(path.join(directory, '.pending-'));
    try {
      const tempFile = path.join(pending, 'model.json');
      writeFileSync(
        tempFile,
        JSON.stringify({ roundId, model, checkedAt: facts.checkedAt }) + '\n',
        { mode: 0o600 }
      );
      try {
        linkSync(tempFile, filename);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    } finally {
      rmSync(pending, { recursive: true, force: true });
    }
    saved = read(filename);
  }
  if (saved?.roundId !== roundId || typeof saved.model !== 'string') {
    throw new Error('The saved round model is unreadable. Check the original round receipt.');
  }
  if (facts.resolvedSunoModel && facts.resolvedSunoModel !== saved.model) {
    throw new Error(
      'The saved model differs from the existing round receipt. Reconcile the round before continuing.'
    );
  }
  if (!facts.availableModels.includes(saved.model)) {
    throw new Error(
      `The round's model, ${saved.model}, is no longer available. Reconcile accepted jobs before planning more.`
    );
  }
  return { roundId, model: saved.model, generationSettings: { model: saved.model } };
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 4)
      throw new Error('Usage: node scripts/suno-model.mjs <round-id> <model-check.json>');
    console.log(
      JSON.stringify(selectRoundModel(process.cwd(), process.argv[2], read(process.argv[3])))
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
