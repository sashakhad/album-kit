import { NextResponse } from 'next/server';

import { requireOwner } from '@/lib/owner/auth';
import { variationRequestSchema } from '@/lib/variations/parent';
import { loadVariationQuote } from '@/lib/variations/service';
import { VariationWebhookError } from '@/lib/variations/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const raw: unknown = await request.json().catch(() => null);
  const parsed = variationRequestSchema.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Choose 1–20 takes and a valid parent take.' },
      { status: 400 }
    );
  try {
    const { quote } = await loadVariationQuote(parsed.data);
    return NextResponse.json({ quote });
  } catch (error) {
    const unavailable = error instanceof VariationWebhookError;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not check the generation cost.' },
      { status: unavailable ? 503 : 409 }
    );
  }
}
