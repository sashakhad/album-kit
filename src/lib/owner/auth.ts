import 'server-only';

import { timingSafeEqual } from 'node:crypto';

export const OWNER_VISITOR_ID = 'owner';

/** Server secret for write requests and for signing listener cookies. Never send it to the browser. */
export function writeToken(): string | null {
  const token = process.env.ALBUM_WRITE_TOKEN;
  return token === undefined || token.length === 0 ? null : token;
}

/** HMAC key. Same value as the write token. */
export function albumKey(): string | null {
  return writeToken();
}

export function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

export function isWriteRequest(request: Request): boolean {
  const token = writeToken();
  if (token === null) return false;
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization')?.trim() ?? '')?.[1];
  return bearer !== undefined && safeEqual(bearer, token);
}

export async function isOwnerRequest(request: Request): Promise<boolean> {
  return isWriteRequest(request);
}

export async function requireOwner(request: Request): Promise<Response | null> {
  if (writeToken() === null) {
    return Response.json({ error: 'ALBUM_WRITE_TOKEN is not set' }, { status: 503 });
  }
  if (!isWriteRequest(request)) {
    return Response.json({ error: 'Write token required' }, { status: 401 });
  }
  return null;
}
