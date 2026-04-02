/**
 * DashboardPage — role-based rendering tests.
 *
 * Verifies that:
 *  - Each role sees only the Quick Actions they are permitted to trigger.
 *  - Forbidden actions are absent from the DOM entirely.
 *  - The role badge and greeting are rendered correctly.
 *  - Clicking a Quick Action opens the correct tab via useTabStore.
 */

import { act, render, screen, waitFor } from '@testing-library/react'
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
  useTabStore.setState({
    tabs: [{ id: 'home', title: 'Dashboard', path: '/', isDirty: false }],
    activeTabId: 'home',
  })
}

/** Render and flush async useEffect (DB stats queries) inside act so all
 *  subsequent setState calls happen within act, suppressing act() warnings. */
function renderPage() {
  return act(() => {
    render(<DashboardPage />)
    return Promise.resolve()
  })
}

beforeEach(() => {
  act(() => {
    resetTab()
  })
})
afterEach(() => {
  act(() => {
    resetTab()
  })
})

// ── Administrator ─────────────────────────────────────────────────────────────

describe('DashboardPage — Administrator', () => {
  beforeEach(() => {
    setUser(Role.Administrator)
  })

  it('shows the Administrator role badge', async () => {
    await renderPage()
    expect(screen.getByText('Administrator')).toBeInTheDocument()
  })

  it('shows all six Quick Action buttons', async () => {
    await renderPage()
    expect(screen.getByRole('button', { name: /new auction/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add catalog item/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload document/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /review queue/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /messages/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /admin panel/i })).toBeInTheDocument()
  })

  it('opens the auctions/new tab when New Auction is clicked', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: /new auction/i }))
    await waitFor(() => {
      const tabs = useTabStore.getState().tabs
      expect(tabs.some((t) => t.path === '/auctions/new')).toBe(true)
    })
  })

  it('opens the admin/users tab when Admin Panel is clicked', async () => {
    await renderPage()
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

  it('shows New Auction, Add Catalog Item, Upload Document, Messages', async () => {
    await renderPage()
    expect(screen.getByRole('button', { name: /new auction/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add catalog item/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload document/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /messages/i })).toBeInTheDocument()
  })

  it('does NOT show Review Queue (approvePublication denied)', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: /review queue/i })).not.toBeInTheDocument()
  })

  it('does NOT show Admin Panel (manageUsers denied)', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: /admin panel/i })).not.toBeInTheDocument()
  })

  it('opens the catalog/new tab when Add Catalog Item is clicked', async () => {
    await renderPage()
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

  it('shows Review Queue and Messages', async () => {
    await renderPage()
    expect(screen.getByRole('button', { name: /review queue/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /messages/i })).toBeInTheDocument()
  })

  it('does NOT show New Auction (createAuction denied)', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: /new auction/i })).not.toBeInTheDocument()
  })

  it('does NOT show Upload Document (createDocument denied)', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: /upload document/i })).not.toBeInTheDocument()
  })

  it('does NOT show Admin Panel', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: /admin panel/i })).not.toBeInTheDocument()
  })

  it('opens the review queue tab when clicked', async () => {
    await renderPage()
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

  it('shows only the Messages Quick Action', async () => {
    await renderPage()
    expect(screen.getByRole('button', { name: /messages/i })).toBeInTheDocument()
  })

  it('does NOT show New Auction', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: /new auction/i })).not.toBeInTheDocument()
  })

  it('does NOT show Add Catalog Item', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: /add catalog item/i })).not.toBeInTheDocument()
  })

  it('does NOT show Upload Document', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: /upload document/i })).not.toBeInTheDocument()
  })

  it('does NOT show Review Queue', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: /review queue/i })).not.toBeInTheDocument()
  })

  it('does NOT show Admin Panel', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: /admin panel/i })).not.toBeInTheDocument()
  })

  it('opens the notifications tab when Messages is clicked', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: /messages/i }))
    await waitFor(() => {
      const tabs = useTabStore.getState().tabs
      expect(tabs.some((t) => t.path === '/notifications')).toBe(true)
    })
  })
})
