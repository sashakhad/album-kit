import {
  format,
  formatDistanceToNow,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  endOfDay,
  differenceInDays,
  addDays,
  subDays,
  getYear,
  getMonth,
} from 'date-fns';

/**
 * Format a date to a human-readable string.
 * @example formatDate(new Date()) // "Feb 14, 2026"
 */
export function formatDate(date: Date | string, pattern: string = 'MMM d, yyyy'): string {
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  return format(parsed, pattern);
}

/**
 * Format a date with time.
 * @example formatDateTime(new Date()) // "Feb 14, 2026 at 3:45 PM"
 */
export function formatDateTime(date: Date | string): string {
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  return format(parsed, "MMM d, yyyy 'at' h:mm a");
}

/**
 * Get a relative time string (e.g., "3 hours ago", "in 2 days").
 */
export function timeAgo(date: Date | string): string {
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(parsed, { addSuffix: true });
}

/**
 * Smart date range formatting that avoids redundancy.
 * Same month: "Jan 1 – 31, 2026". Same year: "Jan 1 – Feb 14, 2026".
 */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  const sameYear = getYear(start) === getYear(end);
  const sameMonth = sameYear && getMonth(start) === getMonth(end);

  if (sameMonth) {
    return `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`;
  }
  if (sameYear) {
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  }
  return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
}

// Re-export commonly used date-fns functions for convenience
export {
  format,
  formatDistanceToNow,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  endOfDay,
  differenceInDays,
  addDays,
  subDays,
};
