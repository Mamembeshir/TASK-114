/**
 * Unit tests for BootstrapAdminPage — the first-run Administrator setup wizard.
 *
 * These tests render the component directly in jsdom (fake-indexeddb).
 * They cover:
 *   - Page structure and field rendering
 *   - Client-side validation: required fields, password length,
 *     username format, password confirmation mismatch
 *
 * The full happy-path (PBKDF2 hash → DB write → auto-login) is covered by
 * the E2E bootstrap.spec.ts which requires a non-seeded production build.
 */

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { BootstrapAdminPage } from '@/pages/BootstrapAdminPage'

async function renderAndFlush(ui: React.ReactElement) {
  await act(async () => {
    render(ui)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(async () => {
  await renderAndFlush(<BootstrapAdminPage />)
})

// ── Structure ─────────────────────────────────────────────────────────────────

describe('BootstrapAdminPage — structure', () => {
  it('shows the "First-Run Setup" subheading', async () => {
    expect(screen.getByText('First-Run Setup')).toBeInTheDocument()
  })

  it('shows the "Create Administrator Account" card heading', async () => {
    expect(screen.getByText('Create Administrator Account')).toBeInTheDocument()
  })

  it('shows the Initial Administrator Setup notice', async () => {
    expect(screen.getByText('Initial Administrator Setup')).toBeInTheDocument()
  })

  it('renders all five form fields', async () => {
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    // Two password fields — both present
    const passwordFields = screen.getAllByLabelText(/password/i)
    expect(passwordFields.length).toBeGreaterThanOrEqual(2)
  })

  it('renders the "Create Administrator & Sign In" submit button', async () => {
    expect(screen.getByRole('button', { name: /create administrator & sign in/i })).toBeInTheDocument()
  })

  it('shows the Administrator account-type badge', async () => {
    expect(screen.getByText('Administrator')).toBeInTheDocument()
  })
})

// ── Client-side validation ────────────────────────────────────────────────────

describe('BootstrapAdminPage — validation', () => {
  it('clicking submit with empty fields shows display-name and username errors', async () => {
    await userEvent.click(screen.getByRole('button', { name: /create administrator & sign in/i }))
    await waitFor(() => {
      expect(screen.getByText('Display name is required')).toBeInTheDocument()
      expect(screen.getByText('Username is required')).toBeInTheDocument()
    })
  })

  it('password shorter than 12 characters shows "At least 12 characters required"', async () => {
    await userEvent.type(screen.getByLabelText(/display name/i), 'Admin')
    await userEvent.type(screen.getByLabelText(/^username/i), 'adminuser')
    // Directly target the first password field by its id
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Short1!')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Short1!')
    await userEvent.click(screen.getByRole('button', { name: /create administrator & sign in/i }))
    await waitFor(() => {
      expect(screen.getByText('At least 12 characters required')).toBeInTheDocument()
    })
  })

  it('username containing uppercase letters shows a format error', async () => {
    await userEvent.type(screen.getByLabelText(/display name/i), 'Admin')
    await userEvent.type(screen.getByLabelText(/^username/i), 'AdminUser') // uppercase — invalid
    await userEvent.type(screen.getByLabelText(/^password$/i), 'ValidPass123!')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'ValidPass123!')
    await userEvent.click(screen.getByRole('button', { name: /create administrator & sign in/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/lowercase letters, numbers, underscores only/i),
      ).toBeInTheDocument()
    })
  })

  it('username shorter than 3 characters shows the format error', async () => {
    await userEvent.type(screen.getByLabelText(/display name/i), 'Admin')
    await userEvent.type(screen.getByLabelText(/^username/i), 'ab')  // too short
    await userEvent.type(screen.getByLabelText(/^password$/i), 'ValidPass123!')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'ValidPass123!')
    await userEvent.click(screen.getByRole('button', { name: /create administrator & sign in/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/lowercase letters, numbers, underscores only/i),
      ).toBeInTheDocument()
    })
  })

  it('mismatched confirm password shows "Passwords do not match"', async () => {
    await userEvent.type(screen.getByLabelText(/display name/i), 'Admin')
    await userEvent.type(screen.getByLabelText(/^username/i), 'adminuser')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'ValidPass123!')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'DifferentPass456!')
    await userEvent.click(screen.getByRole('button', { name: /create administrator & sign in/i }))
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    })
  })

  it('a malformed email shows "Enter a valid email address"', async () => {
    await userEvent.type(screen.getByLabelText(/display name/i), 'Admin')
    await userEvent.type(screen.getByLabelText(/^username/i), 'adminuser')
    await userEvent.type(screen.getByLabelText(/email/i), 'notanemail')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'ValidPass123!')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'ValidPass123!')
    await userEvent.click(screen.getByRole('button', { name: /create administrator & sign in/i }))
    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    })
  })

  it('password confirmation error clears once both fields match on re-submit', async () => {
    // First submit with mismatch
    await userEvent.type(screen.getByLabelText(/display name/i), 'Admin')
    await userEvent.type(screen.getByLabelText(/^username/i), 'adminuser')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'ValidPass123!')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Mismatch1234!')
    await userEvent.click(screen.getByRole('button', { name: /create administrator & sign in/i }))
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    })

    // Fix the confirm field and re-validate — error should disappear
    await userEvent.clear(screen.getByLabelText(/confirm password/i))
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'ValidPass123!')
    // Re-submit to trigger re-validation
    await userEvent.click(screen.getByRole('button', { name: /create administrator & sign in/i }))
    await waitFor(() => {
      expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument()
    })
  })
})
