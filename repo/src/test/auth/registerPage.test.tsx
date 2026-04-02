/**
 * RegisterPage — component tests.
 *
 * Covers: form rendering, all field validation rules (including the 12-char
 * password minimum and username regex), the "back to login" link, and the
 * role badge showing Buyer / Participant.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RegisterPage } from '@/pages/RegisterPage'
import { useAuthStore } from '@/store/authStore'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function renderRegister(onBackToLogin = vi.fn()) {
  return render(<RegisterPage onBackToLogin={onBackToLogin} />)
}

function resetAuthStore() {
  useAuthStore.setState({ isLoading: false, error: null, currentUser: null, sessionId: null })
}

describe('RegisterPage — rendering', () => {
  beforeEach(resetAuthStore)

  it('renders the "Register as a Buyer" heading', () => {
    renderRegister()
    expect(screen.getByText(/register as a buyer/i)).toBeInTheDocument()
  })

  it('renders all five fields', () => {
    renderRegister()
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    // Two password fields — match by placeholder text since labels are similar
    expect(screen.getByPlaceholderText(/min\. 12 characters/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/repeat your password/i)).toBeInTheDocument()
  })

  it('shows the Buyer (Participant) role badge', () => {
    renderRegister()
    expect(screen.getByText(/buyer \(participant\)/i)).toBeInTheDocument()
  })

  it('renders the "Already have an account? Sign in" back link', () => {
    renderRegister()
    expect(screen.getByText(/already have an account/i)).toBeInTheDocument()
  })
})

describe('RegisterPage — field validation', () => {
  beforeEach(resetAuthStore)

  it('requires username on submit', async () => {
    renderRegister()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/username is required/i)).toBeInTheDocument()
  })

  it('rejects username shorter than 3 chars', async () => {
    renderRegister()
    await userEvent.type(screen.getByLabelText(/username/i), 'ab')
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/lowercase letters, numbers, underscores/i)).toBeInTheDocument()
  })

  it('rejects username with uppercase letters', async () => {
    renderRegister()
    await userEvent.type(screen.getByLabelText(/username/i), 'Alice')
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/lowercase letters, numbers, underscores/i)).toBeInTheDocument()
  })

  it('requires display name', async () => {
    renderRegister()
    await userEvent.type(screen.getByLabelText(/username/i), 'alice_42')
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/display name is required/i)).toBeInTheDocument()
  })

  it('rejects an invalid email format', async () => {
    renderRegister()
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
    fireEvent.blur(screen.getByLabelText(/email/i))
    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument()
  })

  it('accepts an empty email (field is optional)', async () => {
    renderRegister()
    fireEvent.blur(screen.getByLabelText(/email/i))
    expect(screen.queryByText(/enter a valid email/i)).not.toBeInTheDocument()
  })

  it('enforces the 12-character minimum on password', async () => {
    renderRegister()
    await userEvent.type(screen.getByPlaceholderText(/min\. 12 characters/i), 'short')
    fireEvent.blur(screen.getByPlaceholderText(/min\. 12 characters/i))
    expect(await screen.findByText(/at least 12 characters/i)).toBeInTheDocument()
  })

  it('requires password confirmation to match', async () => {
    renderRegister()
    await userEvent.type(screen.getByPlaceholderText(/min\. 12 characters/i), 'StrongPassword1!')
    await userEvent.type(screen.getByPlaceholderText(/repeat your password/i), 'Different!')
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
  })
})

describe('RegisterPage — navigation', () => {
  beforeEach(resetAuthStore)

  it('calls onBackToLogin when the back link is clicked', async () => {
    const onBack = vi.fn()
    renderRegister(onBack)
    await userEvent.click(screen.getByText(/sign in/i))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
