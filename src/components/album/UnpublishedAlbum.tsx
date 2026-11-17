import Link from 'next/link';

export const UNPUBLISHED_ALBUM_MESSAGE =
  "This album isn't published yet — the owner can choose public or private in Settings";

export function UnpublishedAlbum() {
  return (
    <main className='mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-6 py-16 text-center'>
      <h1 className='text-2xl font-semibold tracking-tight text-balance'>
        This album isn&apos;t published yet — the owner can choose public or private in{' '}
        <Link href='/settings' className='underline underline-offset-4'>
          Settings
        </Link>
      </h1>
    </main>
  );
}
