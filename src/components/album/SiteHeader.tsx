'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export function SiteHeader({
  albumTitle,
  isOwner,
  showVote = isOwner,
  showListen = true,
}: {
  albumTitle: string;
  isOwner: boolean;
  showVote?: boolean;
  showListen?: boolean;
}) {
  const pathname = usePathname();

  return (
    <header className='border-b border-white/8'>
      <div className='mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6'>
        <Link
          href={showListen ? '/' : '/key'}
          className='text-foreground hover:text-primary inline-flex min-h-11 min-w-0 items-center text-xl tracking-tight sm:text-2xl'
        >
          {albumTitle}
        </Link>
        <nav
          aria-label='Album'
          className={cn(
            'max-w-full items-center gap-1',
            isOwner ? 'grid w-full grid-cols-3 sm:flex sm:w-auto' : 'flex flex-wrap'
          )}
        >
          {showListen ? (
            <NavPill href='/listen' active={isSection(pathname, '/listen')}>
              Listen
            </NavPill>
          ) : (
            <NavPill href='/key' active={isSection(pathname, '/key')}>
              Owner password
            </NavPill>
          )}
          {showVote ? (
            <NavPill href='/vote' active={isSection(pathname, '/vote')}>
              Compare takes
            </NavPill>
          ) : null}
          {isOwner ? (
            <NavPill href='/settings' active={isSection(pathname, '/settings')}>
              Settings
            </NavPill>
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
        'inline-flex min-h-11 items-center justify-center rounded-lg px-2 text-center text-sm leading-tight sm:px-3',
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
