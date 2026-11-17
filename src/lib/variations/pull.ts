import type { VariationQuote } from '@/lib/variations/quote';

export const CLAIM_LEASE_MS = 10 * 60 * 1000;

export type WorkerDispatch =
  'pull' | 'webhook-pending' | 'webhook-accepted' | 'webhook-uncertain' | 'webhook-rejected';

export type WorkerContext = {
  requestId: string;
  trackNumber?: number;
  trackTitle?: string;
  parentTakeFilename?: string;
  parentStyle?: string | null;
  requestedTakes?: number;
  instructions?: string;
  sunoModelPolicy?: string;
  promptWriter?: string;
  promptWriterModel?: string;
  reviewTakes?: string;
};

export type WorkerPayload = {
  kind: 'generate';
  operationId: string;
  requestId: string;
  trackNumber: number | null;
  trackTitle: string | null;
  parentTakeFilename: string | null;
  parentStyle: string | null;
  requestedTakes: number | null;
  instructions: string | null;
  sunoModelPolicy: string | null;
  promptWriter: string | null;
  promptWriterModel: string | null;
  reviewTakes: string | null;
  quote: VariationQuote;
  creditsReserved: number;
  allowanceReserved: number;
  callbackPath: '/api/owner/variations/callback';
  roundPath: '/api/owner/rounds';
  liveAccountChecked: boolean;
  dispatch: WorkerDispatch;
};

export function buildWorkerPayload(args: {
  context: WorkerContext;
  quote: VariationQuote;
  operationId: string;
  liveAccountChecked: boolean;
  dispatch: WorkerDispatch;
}): WorkerPayload {
  const { context } = args;
  return {
    kind: 'generate',
    operationId: args.operationId,
    requestId: context.requestId,
    trackNumber: context.trackNumber ?? null,
    trackTitle: context.trackTitle ?? null,
    parentTakeFilename: context.parentTakeFilename ?? null,
    parentStyle: context.parentStyle ?? null,
    requestedTakes: context.requestedTakes ?? null,
    instructions: context.instructions ?? null,
    sunoModelPolicy: context.sunoModelPolicy ?? null,
    promptWriter: context.promptWriter ?? null,
    promptWriterModel: context.promptWriterModel ?? null,
    reviewTakes: context.reviewTakes ?? null,
    quote: args.quote,
    creditsReserved: args.quote.generationCredits,
    allowanceReserved: args.quote.generationCredits,
    callbackPath: '/api/owner/variations/callback',
    roundPath: '/api/owner/rounds',
    liveAccountChecked: args.liveAccountChecked,
    dispatch: args.dispatch,
  };
}

export function claimIsActive(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() > now.getTime();
}

export function isAwaitingWorker(
  row: { status: string; claimExpiresAt: Date | null },
  now: Date
): boolean {
  return row.status === 'generating' && !claimIsActive(row.claimExpiresAt, now);
}

type ClaimRow = {
  id: string;
  status: string;
  claimToken: string | null;
  claimExpiresAt: Date | null;
};

export type ClaimDecision =
  | { type: 'missing' }
  | { type: 'unavailable' }
  | { type: 'held' }
  | { type: 'grant'; claimToken: string; claimExpiresAt: Date; refresh: boolean };

export function decideClaim(args: {
  row: ClaimRow | null;
  operationId: string;
  claimToken: string | undefined;
  now: Date;
  nextToken: string;
  leaseMs: number;
}): ClaimDecision {
  const { row, now } = args;
  if (row === null || row.id !== args.operationId) {
    return { type: 'missing' };
  }
  if (row.status !== 'generating') {
    return { type: 'unavailable' };
  }
  const claimExpiresAt = new Date(now.getTime() + args.leaseMs);
  if (
    args.claimToken !== undefined &&
    row.claimToken !== null &&
    args.claimToken === row.claimToken
  ) {
    return { type: 'grant', claimToken: row.claimToken, claimExpiresAt, refresh: true };
  }
  if (claimIsActive(row.claimExpiresAt, now)) {
    return { type: 'held' };
  }
  return { type: 'grant', claimToken: args.nextToken, claimExpiresAt, refresh: false };
}
