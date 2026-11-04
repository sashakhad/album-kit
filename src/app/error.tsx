'use client';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center'>
      <h1 className='text-2xl font-semibold'>Something went wrong</h1>
      <p className='text-muted-foreground max-w-md text-sm'>
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button
        type='button'
        onClick={reset}
        className='bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium'
      >
        Try again
      </button>
    </main>
  );
}
