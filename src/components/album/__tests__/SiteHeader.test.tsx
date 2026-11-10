import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SiteHeader } from '../SiteHeader';

vi.mock('next/navigation', () => ({
  usePathname: () => '/listen/track-one',
}));

describe('SiteHeader', () => {
  it('shows the album title with Home and Listen for everyone', () => {
    render(<SiteHeader albumTitle='Fixture Album' isOwner={false} />);

    expect(screen.getByRole('link', { name: 'Fixture Album' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Listen' })).toHaveAttribute('href', '/listen');
    expect(screen.getByRole('link', { name: 'Listen' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Vote' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Intake' })).not.toBeInTheDocument();
  });

  it('adds Vote and Intake for the owner', () => {
    render(<SiteHeader albumTitle='Fixture Album' isOwner />);

    expect(screen.getByRole('link', { name: 'Vote' })).toHaveAttribute('href', '/vote');
    expect(screen.getByRole('link', { name: 'Intake' })).toHaveAttribute('href', '/intake');
  });

  it('shows Vote to a listener without owner controls', () => {
    render(<SiteHeader albumTitle='Fixture Album' isOwner={false} showVote />);

    expect(screen.getByRole('link', { name: 'Vote' })).toHaveAttribute('href', '/vote');
    expect(screen.queryByRole('link', { name: 'Intake' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });
});
