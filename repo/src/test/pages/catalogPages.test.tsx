/**
 * Catalog page rendering tests.
 *
 * CatalogManagementPage — admin/editor management view
 * CatalogBrowsePage     — participant/all-roles browse view
 * ModerationQueuePage   — reviewer/admin flagged-items queue
 *
 * All pages render against the real Dexie database (fake-indexeddb polyfill).
 * Empty DB → empty-state messages appear; no data mocking required.
 */

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CatalogManagementPage } from '@/pages/catalog/CatalogManagementPage'
import { CatalogBrowsePage } from '@/pages/catalog/CatalogBrowsePage'
import { ModerationQueuePage } from '@/pages/catalog/ModerationQueuePage'
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

// ── CatalogManagementPage ─────────────────────────────────────────────────────

describe('CatalogManagementPage', () => {
  it('renders the Catalog heading', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<CatalogManagementPage />)
    expect(await screen.findByRole('heading', { name: 'Catalog' })).toBeInTheDocument()
  })

  it('shows the + New Item button for ContentEditor', async () => {
    setUser(Role.ContentEditor)
    await renderAndFlush(<CatalogManagementPage />)
    expect(await screen.findByText(/\+ New Item/)).toBeInTheDocument()
  })

  it('shows empty state when no catalog items exist', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<CatalogManagementPage />)
    expect(await screen.findByText('No items')).toBeInTheDocument()
  })

  it('renders status filter buttons', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<CatalogManagementPage />)
    expect(await screen.findByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archived' })).toBeInTheDocument()
  })

  it('clicking + New Item opens the catalog/new tab', async () => {
    setUser(Role.ContentEditor)
    await renderAndFlush(<CatalogManagementPage />)
    await userEvent.click(await screen.findByText(/\+ New Item/))
    await waitFor(() => {
      expect(useTabStore.getState().tabs.some((t) => t.path === '/catalog/new')).toBe(true)
    })
  })

  it('renders nothing when no user is logged in', async () => {
    await renderAndFlush(<CatalogManagementPage />)
    expect(screen.queryByRole('heading', { name: 'Catalog' })).not.toBeInTheDocument()
  })
})

// ── CatalogBrowsePage ─────────────────────────────────────────────────────────

describe('CatalogBrowsePage', () => {
  it('renders the Browse Catalog heading', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<CatalogBrowsePage />)
    expect(await screen.findByRole('heading', { name: 'Browse Catalog' })).toBeInTheDocument()
  })

  it('shows empty state when no active items exist', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<CatalogBrowsePage />)
    expect(await screen.findByText('No items found')).toBeInTheDocument()
  })

  it('renders the search input', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<CatalogBrowsePage />)
    expect(await screen.findByPlaceholderText(/search by title/i)).toBeInTheDocument()
  })

  it('renders the sort dropdown', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<CatalogBrowsePage />)
    expect(await screen.findByRole('combobox')).toBeInTheDocument()
  })
})

// ── ModerationQueuePage ───────────────────────────────────────────────────────

describe('ModerationQueuePage', () => {
  it('renders the Moderation Queue heading', async () => {
    setUser(Role.ReviewerApprover)
    await renderAndFlush(<ModerationQueuePage />)
    expect(await screen.findByRole('heading', { name: 'Moderation Queue' })).toBeInTheDocument()
  })

  it('shows empty state when no flagged items exist', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<ModerationQueuePage />)
    expect(await screen.findByText('No items flagged')).toBeInTheDocument()
  })

  it('renders nothing when no user is logged in', async () => {
    await renderAndFlush(<ModerationQueuePage />)
    expect(screen.queryByRole('heading', { name: 'Moderation Queue' })).not.toBeInTheDocument()
  })
})
