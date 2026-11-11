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
    expect(screen.getByRole('link', { name: 'Listen' })).toHaveAttribute('href', '/listen');
    expect(screen.getByRole('link', { name: 'Listen' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Compare takes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Intake' })).not.toBeInTheDocument();
  });

  it('keeps comparison and settings directly available to the owner', () => {
    render(<SiteHeader albumTitle='Fixture Album' isOwner />);

    expect(screen.getByRole('link', { name: 'Compare takes' })).toHaveAttribute('href', '/vote');
    expect(screen.queryByRole('link', { name: 'Final picks' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('shows Vote to a listener without owner controls', () => {
    render(<SiteHeader albumTitle='Fixture Album' isOwner={false} showVote />);

    expect(screen.getByRole('link', { name: 'Compare takes' })).toHaveAttribute('href', '/vote');
    expect(screen.queryByRole('link', { name: 'Intake' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });
});
