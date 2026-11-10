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
      <div className='mx-auto flex max-w-5xl flex-wrap items-baseline justify-between gap-4 px-6 py-5'>
        <Link href='/' className='text-foreground hover:text-primary text-2xl tracking-tight'>
          {albumTitle}
        </Link>
        <nav aria-label='Album' className='flex flex-wrap gap-1'>
          <NavPill href='/' active={pathname === '/'}>
            Home
          </NavPill>
          <NavPill href='/listen' active={isSection(pathname, '/listen')}>
            Listen
          </NavPill>
          {showVote ? (
            <NavPill href='/vote' active={isSection(pathname, '/vote')}>
              Vote
            </NavPill>
          ) : null}
          {isOwner ? (
            <>
              <NavPill href='/intake' active={isSection(pathname, '/intake')}>
                Intake
              </NavPill>
              <NavPill href='/settings' active={isSection(pathname, '/settings')}>
                Settings
              </NavPill>
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
        'rounded-full px-3 py-1 text-sm',
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
