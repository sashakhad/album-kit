import Link from 'next/link';

export default function NotFound() {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center'>
      <h1 className='text-2xl font-semibold'>Page not found</h1>
      <p className='text-muted-foreground max-w-md text-sm'>
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href='/'
        className='bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium'
      >
        Back home
      </Link>
    </main>
  );
}
