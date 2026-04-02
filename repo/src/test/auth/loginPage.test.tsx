/**
 * LoginPage — component tests.
 *
 * Covers: form rendering, field validation, error display (including lockout
 * message from auth store), and the register navigation link.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LoginPage } from '@/pages/LoginPage'
import { useAuthStore } from '@/store/authStore'

// Silence sonner toasts in jsdom
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function renderLogin(onRegister = vi.fn()) {
  return render(<LoginPage onRegister={onRegister} />)
}

function resetAuthStore() {
  useAuthStore.setState({ isLoading: false, error: null, currentUser: null, sessionId: null })
}

describe('LoginPage — rendering', () => {
  beforeEach(resetAuthStore)

  it('renders the Meridian Portal heading', () => {
    renderLogin()
    expect(screen.getByText('Meridian Portal')).toBeInTheDocument()
  })

  it('renders username and password fields', () => {
    renderLogin()
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    // Use exact label text to avoid matching the "Show password" aria-label button
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('renders the Sign In submit button', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('renders the register link for new buyers', () => {
    renderLogin()
    expect(screen.getByText(/new buyer/i)).toBeInTheDocument()
  })
})

describe('LoginPage — field validation', () => {
  beforeEach(resetAuthStore)

  it('shows username required error on submit with empty fields', async () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText(/username is required/i)).toBeInTheDocument()
  })

  it('shows password required error on submit with empty password', async () => {
    renderLogin()
    await userEvent.type(screen.getByLabelText(/username/i), 'alice')
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument()
  })

  it('does not show validation errors before the form is touched', () => {
    renderLogin()
    expect(screen.queryByText(/is required/i)).not.toBeInTheDocument()
  })
})

describe('LoginPage — auth store integration', () => {
  beforeEach(resetAuthStore)

  it('disables the submit button while loading', () => {
    useAuthStore.setState({ isLoading: true })
    renderLogin()
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
  })

  it('surfaces a lockout error from the auth store as a toast', async () => {
    const { toast } = await import('sonner')
    useAuthStore.setState({ error: 'Account locked — too many failed attempts. Try again in 15 minutes.' })
    renderLogin()
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/account locked/i),
      )
    })
  })
})

describe('LoginPage — navigation', () => {
  beforeEach(resetAuthStore)

  it('calls onRegister when the register link is clicked', async () => {
    const onRegister = vi.fn()
    renderLogin(onRegister)
    await userEvent.click(screen.getByText(/create an account/i))
    expect(onRegister).toHaveBeenCalledOnce()
  })
})
