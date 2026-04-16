/**
 * TabContent — PermissionGuard integration tests.
 *
 * Verifies that page-level guards in TabContent correctly deny or allow access
 * based on the current user's role, AND that the real page component renders
 * meaningful content when access is granted.
 *
 * Key design:
 *  - The 6 guarded admin/outbound pages are NOT mocked — they render with the
 *    real implementation against a fake IndexedDB.  This validates that the
 *    permission guard fires correctly AND that the actual page boots without
 *    error for the allowed role.
 *  - All OTHER lazy-loaded pages that appear in TabContent routing are stubbed
 *    with empty <div>s so their Suspense Promises resolve instantly and don't
 *    emit "suspended resource not wrapped in act" warnings in unrelated tests.
 *
 * Guarded routes under test:
 *   /admin/users           requires manageUsers    → Administrator only
 *   /admin/settings        requires manageSystem   → Administrator only
 *   /admin/sensitive-words requires manageSystem   → Administrator only
 *   /admin/audit-log       requires viewAuditLog   → Administrator + ReviewerApprover
 *   /admin/export          requires manageSystem   → Administrator only
 *   /outbound-queue        requires manageMessages → Administrator only
 */

import { act, render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TabContent } from '@/components/layout/TabContent'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { Role } from '@/types'

// ── Stub background-noise lazy pages ─────────────────────────────────────────
// These pages are part of TabContent's routing but are not the focus of these
// tests.  Stubbing them prevents unresolved Suspense Promises from leaking
// "not wrapped in act" warnings into unrelated test cases.

vi.mock('@/pages/DashboardPage', () => ({
  DashboardPage: () => <div data-testid="page-dashboard">Dashboard</div>,
}))
vi.mock('@/pages/auction/AuctionListPage', () => ({ AuctionListPage: () => <div /> }))
vi.mock('@/pages/auction/AuctionFormPage', () => ({ AuctionFormPage: () => <div /> }))
vi.mock('@/pages/auction/AuctionDetailPage', () => ({ AuctionDetailPage: () => <div /> }))
vi.mock('@/pages/auction/AuctionBrowsePage', () => ({ AuctionBrowsePage: () => <div /> }))
vi.mock('@/pages/auction/WalletPage', () => ({ WalletPage: () => <div /> }))
vi.mock('@/pages/auction/MyBidsPage', () => ({ MyBidsPage: () => <div /> }))
vi.mock('@/pages/catalog/CatalogManagementPage', () => ({ CatalogManagementPage: () => <div /> }))
vi.mock('@/pages/catalog/CatalogItemFormPage', () => ({ CatalogItemFormPage: () => <div /> }))
vi.mock('@/pages/catalog/CatalogBrowsePage', () => ({ CatalogBrowsePage: () => <div /> }))
vi.mock('@/pages/catalog/ModerationQueuePage', () => ({ ModerationQueuePage: () => <div /> }))
vi.mock('@/pages/publishing/PublicationListPage', () => ({ PublicationListPage: () => <div /> }))
vi.mock('@/pages/publishing/PublicationFormPage', () => ({ PublicationFormPage: () => <div /> }))
vi.mock('@/pages/publishing/ReviewQueuePage', () => ({ ReviewQueuePage: () => <div /> }))
vi.mock('@/pages/publishing/ReviewDetailPage', () => ({ ReviewDetailPage: () => <div /> }))
vi.mock('@/pages/publishing/PublicationFeedPage', () => ({ PublicationFeedPage: () => <div /> }))
vi.mock('@/pages/publishing/ReadershipsAnalyticsPage', () => ({
  ReadershipsAnalyticsPage: () => <div />,
}))
vi.mock('@/pages/documents/DocumentListPage', () => ({ DocumentListPage: () => <div /> }))
vi.mock('@/pages/documents/DocumentFormPage', () => ({ DocumentFormPage: () => <div /> }))
vi.mock('@/pages/documents/DocumentDetailPage', () => ({ DocumentDetailPage: () => <div /> }))
vi.mock('@/pages/training/TrainingPage', () => ({ TrainingPage: () => <div /> }))
vi.mock('@/pages/notifications/NotificationCenterPage', () => ({
  NotificationCenterPage: () => <div />,
}))
vi.mock('@/pages/admin/DataImportPage', () => ({ DataImportPage: () => <div /> }))

// NOTE: UserManagementPage, SystemSettingsPage, SensitiveWordListPage,
// AuditLogPage, DataExportPage, and OutboundQueuePage are intentionally NOT
// mocked — they render with real implementations against fake IndexedDB.

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function renderAndFlush(ui: React.ReactElement) {
  await act(async () => {
    render(ui)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })
}

function setRole(role: Role) {
  useAuthStore.setState({
    currentUser: makeUser(role),
    sessionId: 'test-session',
    isLoading: false,
    error: null,
  })
}

function openTab(path: string) {
  useTabStore.setState({
    tabs: [{ id: 'test-tab', title: 'Test', path, isDirty: false }],
    activeTabId: 'test-tab',
  })
}

function resetStores() {
  useTabStore.setState({
    tabs: [{ id: 'home', title: 'Dashboard', path: '/', isDirty: false }],
    activeTabId: 'home',
  })
  useAuthStore.setState({
    currentUser: makeUser(Role.Administrator),
    sessionId: 'test-session',
    isLoading: false,
    error: null,
  })
}

beforeEach(() => { act(() => { resetStores() }) })
afterEach(() => { act(() => { resetStores() }) })

// ── /admin/users ─────────────────────────────────────────────────────────────

describe('TabContent /admin/users (requires manageUsers)', () => {
  it('shows Access Denied for Participant', async () => {
    setRole(Role.Participant)
    openTab('/admin/users')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied for ContentEditor', async () => {
    setRole(Role.ContentEditor)
    openTab('/admin/users')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied for ReviewerApprover', async () => {
    setRole(Role.ReviewerApprover)
    openTab('/admin/users')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('renders the real User Management page for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/admin/users')
    await renderAndFlush(<TabContent />)
    // Real page heading — not a stub
    expect(await screen.findByRole('heading', { name: 'User Management' })).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })

  it('shows the + New User button for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/admin/users')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText(/\+ New User/)).toBeInTheDocument()
  })
})

// ── /admin/settings ───────────────────────────────────────────────────────────

describe('TabContent /admin/settings (requires manageSystem)', () => {
  it('shows Access Denied for Participant', async () => {
    setRole(Role.Participant)
    openTab('/admin/settings')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied for ContentEditor', async () => {
    setRole(Role.ContentEditor)
    openTab('/admin/settings')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied for ReviewerApprover', async () => {
    setRole(Role.ReviewerApprover)
    openTab('/admin/settings')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('renders the real System Settings page for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/admin/settings')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByRole('heading', { name: 'System Settings' })).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })

  it('shows the Organisation settings section for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/admin/settings')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Organisation')).toBeInTheDocument()
  })
})

// ── /admin/sensitive-words ────────────────────────────────────────────────────

describe('TabContent /admin/sensitive-words (requires manageSystem)', () => {
  it('shows Access Denied for Participant', async () => {
    setRole(Role.Participant)
    openTab('/admin/sensitive-words')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied for ReviewerApprover', async () => {
    setRole(Role.ReviewerApprover)
    openTab('/admin/sensitive-words')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('renders the real Sensitive Word List page for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/admin/sensitive-words')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByRole('heading', { name: 'Sensitive Word List' })).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })
})

// ── /admin/audit-log ──────────────────────────────────────────────────────────

describe('TabContent /admin/audit-log (requires viewAuditLog)', () => {
  it('shows Access Denied for Participant', async () => {
    setRole(Role.Participant)
    openTab('/admin/audit-log')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied for ContentEditor', async () => {
    setRole(Role.ContentEditor)
    openTab('/admin/audit-log')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('renders the real Audit Log page for ReviewerApprover', async () => {
    setRole(Role.ReviewerApprover)
    openTab('/admin/audit-log')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByRole('heading', { name: 'Audit Log' })).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })

  it('renders the real Audit Log page for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/admin/audit-log')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByRole('heading', { name: 'Audit Log' })).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })

  it('shows the empty-state message when no audit events exist', async () => {
    setRole(Role.Administrator)
    openTab('/admin/audit-log')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('No audit events')).toBeInTheDocument()
  })
})

// ── /admin/export ─────────────────────────────────────────────────────────────

describe('TabContent /admin/export (requires manageSystem)', () => {
  it('shows Access Denied for Participant', async () => {
    setRole(Role.Participant)
    openTab('/admin/export')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('renders the real Data Export page for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/admin/export')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByRole('heading', { name: 'Data Export' })).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })
})

// ── /outbound-queue ───────────────────────────────────────────────────────────

describe('TabContent /outbound-queue (requires manageMessages)', () => {
  it('shows Access Denied for Participant', async () => {
    setRole(Role.Participant)
    openTab('/outbound-queue')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied for ContentEditor', async () => {
    setRole(Role.ContentEditor)
    openTab('/outbound-queue')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied for ReviewerApprover', async () => {
    setRole(Role.ReviewerApprover)
    openTab('/outbound-queue')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('renders the real Outbound Queue page for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/outbound-queue')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByRole('heading', { name: 'Outbound Queue' })).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })
})

// ── Unauthenticated user ──────────────────────────────────────────────────────

describe('TabContent — unauthenticated user', () => {
  it('shows Access Denied on /admin/users when no user is logged in', async () => {
    useAuthStore.setState({ currentUser: null, sessionId: null, isLoading: false, error: null })
    openTab('/admin/users')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied on /outbound-queue when no user is logged in', async () => {
    useAuthStore.setState({ currentUser: null, sessionId: null, isLoading: false, error: null })
    openTab('/outbound-queue')
    await renderAndFlush(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })
})
