/**
 * Training and Notifications page rendering tests.
 *
 * TrainingPage             — course list with progress tracking
 * NotificationCenterPage   — inbox + subscription preferences
 */

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TrainingPage } from '@/pages/training/TrainingPage'
import { NotificationCenterPage } from '@/pages/notifications/NotificationCenterPage'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { Role } from '@/types'

function makeUser(role: Role) {
  return {
    id: `user-${role}`,
    username: role.toLowerCase(),
    displayName: `${role} User`,
    email: `${role.toLowerCase()}@test`,
    passwordHash: '',
    passwordSalt: '',
    role,
    isActive: true,
    isTemporaryPassword: false,
    createdAt: 0,
    updatedAt: 0,
    createdBy: 'system',
  }
}

function setUser(role: Role) {
  useAuthStore.setState({ currentUser: makeUser(role), sessionId: 'test', isLoading: false, error: null })
}

function resetStores() {
  useAuthStore.setState({ currentUser: null, sessionId: null, isLoading: false, error: null })
  useTabStore.setState({ tabs: [{ id: 'home', title: 'Dashboard', path: '/', isDirty: false }], activeTabId: 'home' })
}

async function renderAndFlush(ui: React.ReactElement) {
  await act(async () => {
    render(ui)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => { act(() => { resetStores() }) })
afterEach(() => { act(() => { resetStores() }) })

// ── TrainingPage ──────────────────────────────────────────────────────────────

describe('TrainingPage', () => {
  it('renders the Training heading', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<TrainingPage />)
    expect(await screen.findByRole('heading', { name: 'Training' })).toBeInTheDocument()
  })

  it('shows compliance description text', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<TrainingPage />)
    expect(await screen.findByText(/compliance record/i)).toBeInTheDocument()
  })

  it('renders for Administrator too', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<TrainingPage />)
    expect(await screen.findByRole('heading', { name: 'Training' })).toBeInTheDocument()
  })

  it('renders nothing when no user is logged in', async () => {
    await renderAndFlush(<TrainingPage />)
    expect(screen.queryByRole('heading', { name: 'Training' })).not.toBeInTheDocument()
  })
})

// ── NotificationCenterPage ────────────────────────────────────────────────────

describe('NotificationCenterPage', () => {
  it('renders the Notifications heading', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<NotificationCenterPage />)
    expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('shows inbox and preferences tabs', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<NotificationCenterPage />)
    expect(await screen.findByRole('button', { name: /inbox/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /preferences/i })).toBeInTheDocument()
  })

  it('shows "All caught up" when there are no unread notifications', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<NotificationCenterPage />)
    expect(await screen.findByText('All caught up')).toBeInTheDocument()
  })

  it('clicking Preferences tab shows subscription table', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<NotificationCenterPage />)
    const prefsTab = await screen.findByRole('button', { name: /preferences/i })
    await userEvent.click(prefsTab)
    expect(await screen.findByText(/control which notification types/i)).toBeInTheDocument()
  })

  it('renders nothing when no user is logged in', async () => {
    await renderAndFlush(<NotificationCenterPage />)
    expect(screen.queryByRole('heading', { name: 'Notifications' })).not.toBeInTheDocument()
  })
})
