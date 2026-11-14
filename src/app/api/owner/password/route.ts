import { NextResponse } from 'next/server';
import { z } from 'zod';

import { OWNER_COOKIE, ownerCookieOptions, ownerCookieValue, requireOwner } from '@/lib/owner/auth';
import { saveOwnerPassword, usableOwnerPassword } from '@/lib/owner/password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ password: z.string(), confirm: z.string() }).strict();

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const password = parsed.success ? usableOwnerPassword(parsed.data.password) : null;
  if (!parsed.success || password === null || password !== parsed.data.confirm) {
    return NextResponse.json(
      { error: 'Use 4 to 200 characters, and enter the same password twice.' },
      { status: 400 }
    );
  }

  try {
    await saveOwnerPassword(password);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Couldn’t save the password.';
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(OWNER_COOKIE, ownerCookieValue(password), ownerCookieOptions());
  return response;
}
