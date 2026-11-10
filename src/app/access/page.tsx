import { AccessForm } from '@/components/owner/AccessForm';

export const metadata = { title: 'Album access', robots: { index: false, follow: false } };

export default function AccessPage() {
  return (
    <main className='mx-auto max-w-md space-y-4 px-6 py-16'>
      <h1 className='text-2xl font-semibold'>Album access</h1>
      <AccessForm />
    </main>
  );
}
