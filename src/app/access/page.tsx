import { AccessForm } from '@/components/owner/AccessForm';

export const metadata = {
  title: 'Listener invitation',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
} as const;

export default function AccessPage() {
  return (
    <main className='mx-auto max-w-md space-y-4 px-6 py-16'>
      <h1 className='text-2xl font-semibold'>Listener invitation</h1>
      <AccessForm />
    </main>
  );
}
