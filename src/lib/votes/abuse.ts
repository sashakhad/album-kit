export const LISTENER_VOTE_CAP = 20;
export const LISTENER_VOTES_PER_MINUTE = 30;
export const LISTENER_VOTES_WINDOW_MS = 60_000;
export const LISTENER_IDENTITIES_PER_HOUR = 20;
export const LISTENER_IDENTITIES_WINDOW_MS = 60 * 60_000;

export class ListenerVoteLimitError extends Error {
  constructor() {
    super('Listener vote limit');
    this.name = 'ListenerVoteLimitError';
  }
}

export function budgetAllows(recentCount: number, limit: number): boolean {
  return recentCount < limit;
}

export function nextListenerValue(current: number, delta: number, cap: number): number | null {
  const next = current + delta;
  if (Math.abs(next) > cap) {
    return null;
  }
  return next;
}
