import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ListenerOwnerClaim } from '../ListenerOwnerClaim';

describe('ListenerOwnerClaim', () => {
  it('tells a signed-out visitor they are voting as a listener', () => {
    render(<ListenerOwnerClaim next='/vote' />);

    expect(screen.getByRole('region', { name: 'Listener ballot' })).toHaveTextContent(
      'You’re voting as a listener'
    );
    expect(screen.queryByLabelText('Owner password')).not.toBeInTheDocument();
  });

  it('opens the owner password on one tap', async () => {
    const user = userEvent.setup();
    render(<ListenerOwnerClaim next='/vote/krill-af' />);

    await user.click(screen.getByRole('button', { name: 'I’m the owner' }));

    expect(screen.getByLabelText('Owner password')).toBeInTheDocument();
    expect(screen.getByLabelText('Owner password')).toHaveAttribute('type', 'password');
  });
});
