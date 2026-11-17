import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { OwnerContinue } from '@/components/owner/OwnerContinue';
import { isOwner, safeNextPath } from '@/lib/owner/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Continue',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

type KeyPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function KeyPage({ searchParams }: KeyPageProps) {
  const { next } = await searchParams;
  const target = safeNextPath(typeof next === 'string' ? next : undefined, '/vote');
  const destination = /^\/key(?:[/?#]|$)/.test(target) ? '/vote' : target;
  if (await isOwner()) redirect(destination);

  return (
    <main className='mx-auto max-w-md space-y-4 px-4 py-16 sm:px-6'>
      <h1 className='text-2xl font-semibold tracking-tight'>Continue</h1>
      <OwnerContinue next={destination} />
    </main>
  );
}
