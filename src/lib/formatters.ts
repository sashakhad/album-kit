/**
 * Compact number formatting with context-aware precision.
 * Under 1k: as-is. 1k–9.9k: 1 decimal k. 10k+: whole k. 1M+: 1 decimal M. 1B+: 1 decimal B.
 */
export function formatNumber(value: number): string {
  if (value >= 1_000_000_000) {
    const formatted = (value / 1_000_000_000).toFixed(1);
    return `${formatted.replace(/\.0$/, '')}B`;
  }
  if (value >= 1_000_000) {
    const formatted = (value / 1_000_000).toFixed(1);
    return `${formatted.replace(/\.0$/, '')}M`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  if (value >= 1_000) {
    const formatted = (value / 1_000).toFixed(1);
    return `${formatted.replace(/\.0$/, '')}k`;
  }
  return Math.round(value).toLocaleString('en-US');
}

/**
 * Full-precision number with locale separators. No decimals.
 */
export function formatNumberExact(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Compact currency with $ prefix.
 * Under $1k: full. $1k–$9.9k: 1 decimal k. $10k+: whole k. $1M+: 1 decimal M. $1B+: 1 decimal B.
 */
export function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    const formatted = (value / 1_000_000_000).toFixed(1);
    return `$${formatted.replace(/\.0$/, '')}B`;
  }
  if (value >= 1_000_000) {
    const formatted = (value / 1_000_000).toFixed(1);
    return `$${formatted.replace(/\.0$/, '')}M`;
  }
  if (value >= 10_000) {
    return `$${Math.round(value / 1_000)}k`;
  }
  if (value >= 1_000) {
    const formatted = (value / 1_000).toFixed(1);
    return `$${formatted.replace(/\.0$/, '')}k`;
  }
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * Full-precision currency with locale separators.
 * E.g., 1234567.89 → "$1,234,567.89"
 */
export function formatCurrencyExact(value: number, decimals: number = 2): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a ratio as a percentage. Pass alreadyPercent=true if the value is already 0–100.
 * 0.125 → "12.5%", 0.50 → "50%"
 */
export function formatPercent(value: number, alreadyPercent: boolean = false): string {
  const percentValue = alreadyPercent ? value : value * 100;
  const formatted = percentValue % 1 === 0 ? percentValue.toFixed(0) : percentValue.toFixed(1);
  return `${formatted}%`;
}
