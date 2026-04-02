/**
 * ForcePasswordChangePage — component tests.
 *
 * Covers: renders only when a user is present, all three validation rules
 * (current required, new ≥12 chars, must differ from current, confirm must
 * match), and the sign-out escape hatch.
 */

import { act, render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ForcePasswordChangePage } from '@/pages/ForcePasswordChangePage'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function makeTemporaryUser() {
  return {
    id: 'tmp-user-1',
    username: 'editor',
    displayName: 'Content Editor',
    email: 'editor@meridian.internal',
    passwordHash: 'hash',
    passwordSalt: 'salt',
    role: Role.ContentEditor,
    isActive: true,
    isTemporaryPassword: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: 'system',
  }
}

function renderPage() {
  return render(<ForcePasswordChangePage />)
}

describe('ForcePasswordChangePage — rendering', () => {
  beforeEach(() => {
    act(() => {
      useAuthStore.setState({
        currentUser: makeTemporaryUser(),
        sessionId: 'test',
        isLoading: false,
        error: null,
      })
    })
  })

  afterEach(() => {
    act(() => {
      useAuthStore.setState({
        currentUser: {
          id: 'test-system-user',
          username: 'system',
          displayName: 'Test System',
          email: 'system@test',
          passwordHash: '',
          passwordSalt: '',
          role: Role.Administrator,
          isActive: true,
          isTemporaryPassword: false,
          createdAt: 0,
          updatedAt: 0,
          createdBy: 'system',
        },
        sessionId: 'test-session',
        isLoading: false,
        error: null,
      })
    })
  })

  it('renders the heading and instruction text', () => {
    renderPage()
    expect(screen.getByText(/set a new password/i)).toBeInTheDocument()
    expect(screen.getByText(/temporary password/i)).toBeInTheDocument()
  })

  it('renders all three password fields', () => {
    renderPage()
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()
    // Use exact labels to avoid matching "Confirm new password" when looking for "New password"
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument()
  })

  it('renders the submit button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /set new password/i })).toBeInTheDocument()
  })

  it('renders the sign-out link', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('returns null when there is no current user', () => {
    useAuthStore.setState({ currentUser: null })
    const { container } = renderPage()
    expect(container.firstChild).toBeNull()
  })
})

describe('ForcePasswordChangePage — validation', () => {
  beforeEach(() => {
    act(() => {
      useAuthStore.setState({ currentUser: makeTemporaryUser() })
    })
  })

  it('requires current password', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }))
    expect(await screen.findByText(/current password is required/i)).toBeInTheDocument()
  })

  it('requires new password to be at least 12 characters', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText('Current password'), 'anything')
    await userEvent.type(screen.getByLabelText('New password'), 'tooshort')
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }))
    expect(await screen.findByText(/at least 12 characters/i)).toBeInTheDocument()
  })

  it('rejects a new password identical to the current one', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText('Current password'), 'SamePassword1!')
    await userEvent.type(screen.getByLabelText('New password'), 'SamePassword1!')
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }))
    expect(await screen.findByText(/must differ from the current one/i)).toBeInTheDocument()
  })

  it('requires confirm to match new password', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText('Current password'), 'OldPassword1!')
    await userEvent.type(screen.getByLabelText('New password'), 'NewPassword1!')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'Mismatch!')
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }))
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
  })
})
