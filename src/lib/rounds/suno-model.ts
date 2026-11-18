export function resolveSunoModel(
  policy: string,
  capabilities: { availableModels: readonly string[]; qualityDefault: string | null },
  setupPath?: 'light' | 'lite' | 'full'
) {
  const available = new Set(capabilities.availableModels);
  const quality =
    capabilities.qualityDefault !== null && available.has(capabilities.qualityDefault)
      ? capabilities.qualityDefault
      : capabilities.availableModels[0];
  if (quality === undefined) {
    throw new Error('Suno returned no available models');
  }
  if (policy === 'auto') {
    const lite = setupPath === 'light' || setupPath === 'lite';
    const model = lite && available.has('v6-mini') ? 'v6-mini' : quality;
    const needsChoice = !lite && quality !== capabilities.qualityDefault && available.size > 1;
    return { model, migration: null, needsChoice };
  }
  if (available.has(policy)) {
    return { model: policy, migration: null, needsChoice: false };
  }
  return {
    model: quality,
    needsChoice: quality !== capabilities.qualityDefault && capabilities.availableModels.length > 1,
    migration:
      capabilities.qualityDefault === quality
        ? `${policy} is unavailable; ${quality} is the account's reported quality default.`
        : `${policy} is unavailable; ${quality} is listed by the account, but its quality priority is unverified.`,
  };
}
