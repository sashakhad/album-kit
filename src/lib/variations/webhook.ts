import 'server-only';

export class VariationWebhookError extends Error {
  constructor(
    message: string,
    public readonly definitelyNotCharged = false
  ) {
    super(message);
  }
}

export function variationWebhookConfigured(): boolean {
  return Boolean(
    process.env.ALBUM_VARIATION_WEBHOOK_URL && process.env.ALBUM_VARIATION_WEBHOOK_SECRET
  );
}

export async function callVariationWebhook(
  kind: 'quote' | 'generate',
  payload: object
): Promise<unknown> {
  const rawUrl = process.env.ALBUM_VARIATION_WEBHOOK_URL;
  const secret = process.env.ALBUM_VARIATION_WEBHOOK_SECRET;
  if (!rawUrl || !secret)
    throw new VariationWebhookError('More takes is not connected to a generation webhook.', true);
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))
    throw new VariationWebhookError('The generation webhook must use HTTPS.', true);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ kind, ...payload }),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
  } catch {
    throw new VariationWebhookError(
      'The generation webhook did not confirm receipt. The operation will not be retried automatically.'
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    throw new VariationWebhookError(
      typeof record.error === 'string'
        ? record.error
        : `Generation webhook returned ${response.status}.`,
      record.chargeApplied === false
    );
  }
  return body;
}
