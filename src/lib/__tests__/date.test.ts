import { describe, expect, it } from 'vitest';

import { formatDate, formatDateRange, formatDateTime } from '../date';

describe('formatDate', () => {
  it('formats an ISO date string', () => {
    expect(formatDate('2026-01-05')).toBe('Jan 5, 2026');
  });
});

describe('formatDateTime', () => {
  it('formats a date with a time component', () => {
    expect(formatDateTime('2026-01-05T15:45:00.000Z')).toMatch(
      /Jan 5, 2026 at \d{1,2}:\d{2} [AP]M/
    );
  });
});

describe('formatDateRange', () => {
  it('collapses the same month', () => {
    expect(formatDateRange('2026-01-01', '2026-01-31')).toBe('Jan 1 – 31, 2026');
  });

  it('keeps months when the year matches', () => {
    expect(formatDateRange('2026-01-01', '2026-02-14')).toBe('Jan 1 – Feb 14, 2026');
  });

  it('keeps full dates across years', () => {
    expect(formatDateRange('2025-12-15', '2026-01-10')).toBe('Dec 15, 2025 – Jan 10, 2026');
  });
});
