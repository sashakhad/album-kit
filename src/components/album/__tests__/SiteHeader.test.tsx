import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SiteHeader } from '../SiteHeader';

vi.mock('next/navigation', () => ({
  usePathname: () => '/listen/track-one',
}));

describe('SiteHeader', () => {
  it('shows Listen and Compare takes on the public site', () => {
    render(<SiteHeader albumTitle='Fixture Album' showSettings />);

    expect(screen.getByRole('link', { name: 'Fixture Album' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Listen' })).toHaveAttribute('href', '/listen');
    expect(screen.getByRole('link', { name: 'Listen' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Compare takes' })).toHaveAttribute('href', '/vote');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('link', { name: 'Owner password' })).not.toBeInTheDocument();
  });
});
