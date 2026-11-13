import Link from 'next/link';

export function RoundProgressBanner({ line }: { line: string | null }) {
  if (line === null) {
    return null;
  }

  return (
    <p
      role='status'
      className='mb-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed'
    >
      {line}{' '}
      <Link href='/status' className='text-foreground underline underline-offset-4'>
        Details
      </Link>
    </p>
  );
}
