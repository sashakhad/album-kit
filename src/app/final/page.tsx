import { redirect } from 'next/navigation';

import { isOwner } from '@/lib/owner/auth';

export const dynamic = 'force-dynamic';

export default async function FinalPage() {
  if (!(await isOwner())) redirect('/key?next=/vote');
  redirect('/vote');
}
