import { NextResponse } from 'next/server';
import { z } from 'zod';

import { albumKey, OWNER_COOKIE, ownerCookieOptions, ownerCookieValue } from '@/lib/owner/auth';
import { consumeOwnerSignInLink } from '@/lib/owner/sign-in-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sessionBodySchema = z.object({ token: z.string() }).strict();

export async function POST(request: Request) {
  const key = albumKey();
  if (key === null) {
    return NextResponse.json({ error: 'ALBUM_WRITE_TOKEN is not set' }, { status: 503 });
  }

  const parsed = sessionBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !(await consumeOwnerSignInLink(parsed.data.token, key))) {
    return NextResponse.json(
      { error: 'This owner link expired or was already used' },
      { status: 410 }
    );
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
