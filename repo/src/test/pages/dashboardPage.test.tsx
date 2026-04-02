/**
 * DashboardPage — role-based rendering tests.
 *
 * Verifies that:
 *  - Each role sees only the Quick Actions they are permitted to trigger.
 *  - Forbidden actions are absent from the DOM entirely.
 *  - The role badge and greeting are rendered correctly.
 *  - Clicking a Quick Action opens the correct tab via useTabStore.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DashboardPage } from '@/pages/DashboardPage'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { Role } from '@/types'

// Stub out Dexie calls so we don't need live DB for rendering tests
vi.mock('@/db', () => ({
  db: {
    auctions: { where: () => ({ equals: () => ({ count: () => Promise.resolve(0) }) }) },
    notifications: { where: () => ({ equals: () => ({ count: () => Promise.resolve(0) }) }) },
    documents: { where: () => ({ notEqual: () => ({ count: () => Promise.resolve(0) }) }) },
    catalogItems: { count: () => Promise.resolve(0) },
  },
}))

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
  useAuthStore.setState({
    currentUser: makeUser(role),
    sessionId: 'test',
    isLoading: false,
    error: null,
  })
}

function resetTab() {
  // Reset tab store to initial state between tests
  useTabStore.setState({
    tabs: [{ id: 'home', title: 'Dashboard', path: '/', isDirty: false }],
    activeTabId: 'home',
  })
}

beforeEach(resetTab)
afterEach(resetTab)

// ── Administrator ─────────────────────────────────────────────────────────────

describe('DashboardPage — Administrator', () => {
  beforeEach(() => {
    setUser(Role.Administrator)
  })

  it('shows the Administrator role badge', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Administrator')).toBeInTheDocument()
  })

  it('shows all six Quick Action buttons', () => {
    render(<DashboardPage />)
    expect(screen.getByRole('button', { name: /new auction/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add catalog item/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload document/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /review queue/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /messages/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /admin panel/i })).toBeInTheDocument()
  })

  it('opens the auctions/new tab when New Auction is clicked', async () => {
    render(<DashboardPage />)
    await userEvent.click(screen.getByRole('button', { name: /new auction/i }))
    await waitFor(() => {
      const tabs = useTabStore.getState().tabs
      expect(tabs.some((t) => t.path === '/auctions/new')).toBe(true)
    })
  })

  it('opens the admin/users tab when Admin Panel is clicked', async () => {
    render(<DashboardPage />)
    await userEvent.click(screen.getByRole('button', { name: /admin panel/i }))
    await waitFor(() => {
      const tabs = useTabStore.getState().tabs
      expect(tabs.some((t) => t.path === '/admin/users')).toBe(true)
    })
  })
})

// ── ContentEditor ─────────────────────────────────────────────────────────────

describe('DashboardPage — ContentEditor', () => {
  beforeEach(() => {
    setUser(Role.ContentEditor)
  })

  it('shows New Auction, Add Catalog Item, Upload Document, Messages', () => {
    render(<DashboardPage />)
    expect(screen.getByRole('button', { name: /new auction/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add catalog item/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload document/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /messages/i })).toBeInTheDocument()
  })

  it('does NOT show Review Queue (approvePublication denied)', () => {
    render(<DashboardPage />)
    expect(screen.queryByRole('button', { name: /review queue/i })).not.toBeInTheDocument()
  })

  it('does NOT show Admin Panel (manageUsers denied)', () => {
    render(<DashboardPage />)
    expect(screen.queryByRole('button', { name: /admin panel/i })).not.toBeInTheDocument()
  })

  it('opens the catalog/new tab when Add Catalog Item is clicked', async () => {
    render(<DashboardPage />)
    await userEvent.click(screen.getByRole('button', { name: /add catalog item/i }))
    await waitFor(() => {
      const tabs = useTabStore.getState().tabs
      expect(tabs.some((t) => t.path === '/catalog/new')).toBe(true)
    })
  })
})

// ── ReviewerApprover ──────────────────────────────────────────────────────────

describe('DashboardPage — ReviewerApprover', () => {
  beforeEach(() => {
    setUser(Role.ReviewerApprover)
  })

  it('shows Review Queue and Messages', () => {
    render(<DashboardPage />)
    expect(screen.getByRole('button', { name: /review queue/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /messages/i })).toBeInTheDocument()
  })

  it('does NOT show New Auction (createAuction denied)', () => {
    render(<DashboardPage />)
    expect(screen.queryByRole('button', { name: /new auction/i })).not.toBeInTheDocument()
  })

  it('does NOT show Upload Document (createDocument denied)', () => {
    render(<DashboardPage />)
    expect(screen.queryByRole('button', { name: /upload document/i })).not.toBeInTheDocument()
  })

  it('does NOT show Admin Panel', () => {
    render(<DashboardPage />)
    expect(screen.queryByRole('button', { name: /admin panel/i })).not.toBeInTheDocument()
  })

  it('opens the review queue tab when clicked', async () => {
    render(<DashboardPage />)
    await userEvent.click(screen.getByRole('button', { name: /review queue/i }))
    await waitFor(() => {
      const tabs = useTabStore.getState().tabs
      expect(tabs.some((t) => t.path === '/publishing/review-queue')).toBe(true)
    })
  })
})

// ── Participant ───────────────────────────────────────────────────────────────

describe('DashboardPage — Participant', () => {
  beforeEach(() => {
    setUser(Role.Participant)
  })

  it('shows only the Messages Quick Action', () => {
    render(<DashboardPage />)
    expect(screen.getByRole('button', { name: /messages/i })).toBeInTheDocument()
  })

  it('does NOT show New Auction', () => {
    render(<DashboardPage />)
    expect(screen.queryByRole('button', { name: /new auction/i })).not.toBeInTheDocument()
  })

  it('does NOT show Add Catalog Item', () => {
    render(<DashboardPage />)
    expect(screen.queryByRole('button', { name: /add catalog item/i })).not.toBeInTheDocument()
  })

  it('does NOT show Upload Document', () => {
    render(<DashboardPage />)
    expect(screen.queryByRole('button', { name: /upload document/i })).not.toBeInTheDocument()
  })

  it('does NOT show Review Queue', () => {
    render(<DashboardPage />)
    expect(screen.queryByRole('button', { name: /review queue/i })).not.toBeInTheDocument()
  })

  it('does NOT show Admin Panel', () => {
    render(<DashboardPage />)
    expect(screen.queryByRole('button', { name: /admin panel/i })).not.toBeInTheDocument()
  })

  it('opens the notifications tab when Messages is clicked', async () => {
    render(<DashboardPage />)
    await userEvent.click(screen.getByRole('button', { name: /messages/i }))
    await waitFor(() => {
      const tabs = useTabStore.getState().tabs
      expect(tabs.some((t) => t.path === '/notifications')).toBe(true)
    })
  })
})
