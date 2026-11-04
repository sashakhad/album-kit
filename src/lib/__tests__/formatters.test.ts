import { describe, expect, it } from 'vitest';

import {
  formatCurrency,
  formatCurrencyExact,
  formatDuration,
  formatNumber,
  formatNumberExact,
  formatPercent,
  formatSignedScore,
} from '../formatters';

describe('formatNumber', () => {
  it('formats compact tiers', () => {
    expect(formatNumber(847)).toBe('847');
    expect(formatNumber(1500)).toBe('1.5k');
    expect(formatNumber(10000)).toBe('10k');
    expect(formatNumber(1_200_000)).toBe('1.2M');
    expect(formatNumber(1_500_000_000)).toBe('1.5B');
  });
});

describe('formatNumberExact', () => {
  it('formats with separators', () => {
    expect(formatNumberExact(1234567)).toBe('1,234,567');
  });
});

describe('formatSignedScore', () => {
  it('keeps a plus on positive scores', () => {
    expect(formatSignedScore(3)).toBe('+3');
    expect(formatSignedScore(0)).toBe('0');
    expect(formatSignedScore(-2)).toBe('-2');
  });
});

describe('formatCurrency', () => {
  it('formats compact USD tiers', () => {
    expect(formatCurrency(847)).toBe('$847');
    expect(formatCurrency(1500)).toBe('$1.5k');
    expect(formatCurrency(10000)).toBe('$10k');
    expect(formatCurrency(2_000_000)).toBe('$2M');
  });
});

describe('formatCurrencyExact', () => {
  it('formats full precision USD', () => {
    expect(formatCurrencyExact(1234567.89)).toBe('$1,234,567.89');
  });
});

describe('formatPercent', () => {
  it('formats ratios and whole percentages', () => {
    expect(formatPercent(0.125)).toBe('12.5%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(50, true)).toBe('50%');
  });
});

describe('formatDuration', () => {
  it('formats a media clock', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3661)).toBe('61:01');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });
});
