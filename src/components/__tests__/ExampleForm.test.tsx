import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ExampleForm } from '../ExampleForm';

describe('ExampleForm', () => {
  it('renders the form title and submit button', () => {
    render(<ExampleForm />);

    expect(screen.getByRole('heading', { name: /example form/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  it('uses accessible email and password input attributes', () => {
    render(<ExampleForm />);

    const email = screen.getByRole('textbox', { name: /^email$/i });
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');

    const password = document.querySelector('input[name="password"]');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
  });

  it('shows validation errors for invalid submission', async () => {
    const user = userEvent.setup();
    render(<ExampleForm />);

    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
    expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
  });
});
