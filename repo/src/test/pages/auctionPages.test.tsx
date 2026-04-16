/**
 * Auction page rendering tests.
 *
 * AuctionListPage   — admin/editor auction management list
 * AuctionBrowsePage — participant live auction browser
 * MyBidsPage        — participant personal bid history
 * WalletPage        — participant/admin wallet view
 */

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AuctionListPage } from '@/pages/auction/AuctionListPage'
import { AuctionBrowsePage } from '@/pages/auction/AuctionBrowsePage'
import { MyBidsPage } from '@/pages/auction/MyBidsPage'
import { WalletPage } from '@/pages/auction/WalletPage'
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

// ── AuctionListPage ───────────────────────────────────────────────────────────

describe('AuctionListPage', () => {
  it('renders the Auctions heading', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<AuctionListPage />)
    expect(await screen.findByRole('heading', { name: 'Auctions' })).toBeInTheDocument()
  })

  it('shows New Auction button for Administrator', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<AuctionListPage />)
    // The button appears in both the header and the empty-state CTA; check at least one exists.
    const buttons = await screen.findAllByRole('button', { name: /new auction/i })
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('shows New Auction button for ContentEditor', async () => {
    setUser(Role.ContentEditor)
    await renderAndFlush(<AuctionListPage />)
    const buttons = await screen.findAllByRole('button', { name: /new auction/i })
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('does NOT show New Auction button for Participant', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<AuctionListPage />)
    await screen.findByRole('heading', { name: 'Auctions' })
    expect(screen.queryByRole('button', { name: /new auction/i })).not.toBeInTheDocument()
  })

  it('clicking New Auction opens the auctions/new tab', async () => {
    setUser(Role.Administrator)
    await renderAndFlush(<AuctionListPage />)
    // The page shows a "New Auction" button in both the header and the empty-state CTA.
    // Click the first match (the header button) to avoid the multiple-elements error.
    const buttons = await screen.findAllByRole('button', { name: /new auction/i })
    await userEvent.click(buttons[0])
    await waitFor(() => {
      expect(useTabStore.getState().tabs.some((t) => t.path === '/auctions/new')).toBe(true)
    })
  })

  it('renders nothing when no user is logged in', async () => {
    await renderAndFlush(<AuctionListPage />)
    expect(screen.queryByRole('heading', { name: 'Auctions' })).not.toBeInTheDocument()
  })
})

// ── AuctionBrowsePage ─────────────────────────────────────────────────────────

describe('AuctionBrowsePage', () => {
  it('renders the Live Auctions heading', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<AuctionBrowsePage />)
    expect(await screen.findByRole('heading', { name: 'Live Auctions' })).toBeInTheDocument()
  })

  it('shows empty state when no active auctions exist', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<AuctionBrowsePage />)
    expect(await screen.findByText('No active auctions')).toBeInTheDocument()
  })
})

// ── MyBidsPage ────────────────────────────────────────────────────────────────

describe('MyBidsPage', () => {
  it('renders the My Bids heading', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<MyBidsPage />)
    expect(await screen.findByRole('heading', { name: 'My Bids' })).toBeInTheDocument()
  })

  it('shows empty state when the participant has no bids', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<MyBidsPage />)
    expect(await screen.findByText('No bids yet')).toBeInTheDocument()
  })

  it('renders nothing when no user is logged in', async () => {
    await renderAndFlush(<MyBidsPage />)
    expect(screen.queryByRole('heading', { name: 'My Bids' })).not.toBeInTheDocument()
  })
})

// ── WalletPage ────────────────────────────────────────────────────────────────

describe('WalletPage', () => {
  it('renders the My Wallet heading', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<WalletPage />)
    expect(await screen.findByRole('heading', { name: 'My Wallet' })).toBeInTheDocument()
  })

  it('shows no transactions empty state for a new wallet', async () => {
    setUser(Role.Participant)
    await renderAndFlush(<WalletPage />)
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
  })

  it('renders nothing when no user is logged in', async () => {
    await renderAndFlush(<WalletPage />)
    expect(screen.queryByRole('heading', { name: 'My Wallet' })).not.toBeInTheDocument()
  })
})
