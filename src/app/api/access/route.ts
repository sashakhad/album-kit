import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  redeemInvite,
  VIEWER_COOKIE,
  viewerCookieOptions,
  viewerCookieValue,
} from '@/lib/owner/viewer';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = z.object({ token: z.string() }).safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
  const id = await redeemInvite(parsed.data.token);
  if (id === null)
    return NextResponse.json(
      { error: 'This link has expired or was already used' },
      { status: 410 }
    );
  const response = new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
  response.cookies.set(VIEWER_COOKIE, viewerCookieValue(id), viewerCookieOptions());
  return response;
}
