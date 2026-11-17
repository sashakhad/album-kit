import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Optional fast-path shape for More takes. Album Bot pulls pending operations
 * and does not need this server. It never calls Suno and never spends credits.
 * Its quote is marked fixture, and the site refuses to start a paid run from a
 * fixture. A live worker checks the account, then calls back ready or failed.
 *
 *   ALBUM_VARIATION_WEBHOOK_SECRET=local node scripts/variation-worker.mjs
 */

export function fixtureQuote() {
  return {
    fixture: true,
    capabilities: {
      availableModels: ['v6'],
      qualityDefault: 'v6',
      costModel: 'v6',
      creditsPerGeneration: 10,
      outputsPerGeneration: 2,
      downloadsPerOutput: 0,
      generationCreditsAvailable: 50,
      downloadsAvailable: 0,
      checkedAt: new Date().toISOString(),
    },
    writerReady: true,
    hostingEligibilityVerified: true,
    externalSpendEstimateUsd: 0,
    hostingChargeEstimateUsd: 0,
  };
}

function sameSecret(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

/**
 * @param {unknown} body
 * @param {Set<string>} ledger
 * @returns {{ status: number, body: Record<string, unknown> }}
 */
export function handleVariationWebhook(body, ledger) {
  if (typeof body !== 'object' || body === null) {
    return { status: 400, body: { error: 'Invalid webhook body.', chargeApplied: false } };
  }
  const message = /** @type {Record<string, unknown>} */ (body);
  if (message.kind === 'quote') return { status: 200, body: fixtureQuote() };
  if (message.kind !== 'generate') {
    return { status: 400, body: { error: 'Unknown webhook kind.', chargeApplied: false } };
  }
  const operationId = message.operationId;
  if (typeof operationId !== 'string' || operationId.length === 0) {
    return { status: 400, body: { error: 'Missing operation ID.', chargeApplied: false } };
  }
  if (ledger.has(operationId)) {
    return { status: 200, body: { operationId, status: 'accepted', duplicate: true } };
  }
  ledger.add(operationId);
  return {
    status: 202,
    body: {
      operationId,
      status: 'accepted',
      fixture: true,
      note: 'No Suno call was made. Album Bot must generate this operation and call back.',
    },
  };
}

/**
 * @param {Request} request
 * @param {Set<string>} ledger
 * @param {string | undefined} secret
 */
export async function variationWorkerResponse(request, ledger, secret) {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (
    secret === undefined ||
    secret.length === 0 ||
    token === undefined ||
    !sameSecret(secret, token)
  ) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = handleVariationWebhook(await request.json().catch(() => null), ledger);
  return Response.json(result.body, { status: result.status });
}

function isCliEntry() {
  const entry = process.argv[1];
  if (entry === undefined || entry.length === 0) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isCliEntry()) {
  const secret = process.env.ALBUM_VARIATION_WEBHOOK_SECRET;
  const ledger = new Set();
  const port = Number(process.env.PORT ?? 8787);
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const request = new Request(`http://127.0.0.1${req.url ?? '/'}`, {
        method: req.method,
        headers: req.headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      });
      void variationWorkerResponse(request, ledger, secret).then(async response => {
        res.writeHead(response.status, { 'content-type': 'application/json' });
        res.end(await response.text());
      });
    });
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(
      `Reference More takes worker on http://127.0.0.1:${port}. It does not call Suno.\n`
    );
  });
}
