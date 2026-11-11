'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export function SiteHeader({
  albumTitle,
  isOwner,
  showVote = isOwner,
}: {
  albumTitle: string;
  isOwner: boolean;
  showVote?: boolean;
}) {
  const pathname = usePathname();

  return (
    <header className='border-b border-white/8'>
      <div className='mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-4 px-4 py-4 sm:px-6'>
        <Link href='/' className='text-foreground hover:text-primary text-2xl tracking-tight'>
          {albumTitle}
        </Link>
        <nav aria-label='Album' className='flex max-w-full flex-wrap items-center gap-1'>
          <NavPill href='/listen' active={isSection(pathname, '/listen')}>
            Listen
          </NavPill>
          {showVote ? (
            <NavPill href='/vote' active={isSection(pathname, '/vote')}>
              Compare takes
            </NavPill>
          ) : null}
          {isOwner ? (
            <>
              <NavPill href='/final' active={isSection(pathname, '/final')}>
                Final picks
              </NavPill>
              <details className='relative'>
                <summary className='text-muted-foreground flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm hover:bg-white/6'>
                  Tools
                </summary>
                <div className='bg-background absolute right-0 z-50 mt-2 w-40 rounded-xl border border-white/15 p-2 shadow-xl'>
                  <Link
                    href='/intake'
                    className='flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-white/6'
                  >
                    Intake
                  </Link>
                  <Link
                    href='/settings'
                    className='flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-white/6'
                  >
                    Settings
                  </Link>
                </div>
              </details>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

function NavPill({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-11 items-center rounded-lg px-3 text-sm',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/6'
      )}
    >
      {children}
    </Link>
  );
}

function isSection(pathname: string, section: string): boolean {
  return pathname === section || pathname.startsWith(`${section}/`);
}
