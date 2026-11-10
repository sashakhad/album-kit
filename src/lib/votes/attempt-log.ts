import 'server-only';

import { prisma } from '@/lib/prisma';
import { budgetAllows } from '@/lib/votes/abuse';

export async function takeAttempt(
  bucket: string,
  windowMs: number,
  limit: number
): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  const recent = await prisma.voteAttempt.count({
    where: { bucket, createdAt: { gt: since } },
  });
  if (!budgetAllows(recent, limit)) {
    return false;
  }
  await prisma.voteAttempt.create({ data: { bucket } });
  const stale = new Date(Date.now() - windowMs * 4);
  await prisma.voteAttempt.deleteMany({ where: { bucket, createdAt: { lt: stale } } });
  return true;
}
