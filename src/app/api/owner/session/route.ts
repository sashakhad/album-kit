import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  albumKey,
  isAlbumKey,
  OWNER_COOKIE,
  ownerCookieOptions,
  ownerCookieValue,
} from '@/lib/owner/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sessionBodySchema = z.object({
  key: z.string(),
});

export async function POST(request: Request) {
  const key = albumKey();
  if (key === null) {
    return NextResponse.json({ error: 'ALBUM_KEY is not set' }, { status: 503 });
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = sessionBodySchema.safeParse(raw);
  if (!parsed.success || !isAlbumKey(parsed.data.key)) {
    return NextResponse.json({ error: 'Wrong key' }, { status: 401 });
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(OWNER_COOKIE, ownerCookieValue(key), ownerCookieOptions());
  return response;
}

export function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(OWNER_COOKIE, '', ownerCookieOptions(0));
  return response;
}
