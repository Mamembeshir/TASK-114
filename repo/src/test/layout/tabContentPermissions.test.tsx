/**
 * TabContent — PermissionGuard privilege-escalation tests.
 *
 * Verifies that page-level guards in TabContent correctly deny access when a
 * low-privilege user's tab path points at a restricted route. Each guarded
 * route is tested for at least one denied role and one allowed role to confirm
 * the guard fires and is not accidentally hardcoded to "always deny".
 *
 * Guarded routes under test:
 *   /admin/users          requires manageUsers       → Admin only
 *   /admin/settings       requires manageSystem      → Admin only
 *   /admin/sensitive-words requires manageSystem     → Admin only
 *   /admin/audit-log      requires viewAuditLog      → Admin + Reviewer
 *   /admin/export         requires manageSystem      → Admin only
 *   /outbound-queue       requires manageMessages    → Admin only
 *
 * Strategy: lazy-loaded page modules are mocked with lightweight stubs so the
 * Suspense resolves instantly and the test doesn't depend on Dexie availability.
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TabContent } from '@/components/layout/TabContent'
import { useAuthStore } from '@/store/authStore'
import { useTabStore } from '@/store/tabStore'
import { Role } from '@/types'

// ── Stub lazy-loaded page modules ─────────────────────────────────────────────

vi.mock('@/pages/admin/UserManagementPage', () => ({
  UserManagementPage: () => <div data-testid="page-user-management">User Management Page</div>,
}))
vi.mock('@/pages/admin/SystemSettingsPage', () => ({
  SystemSettingsPage: () => <div data-testid="page-system-settings">System Settings Page</div>,
}))
vi.mock('@/pages/admin/SensitiveWordListPage', () => ({
  SensitiveWordListPage: () => <div data-testid="page-sensitive-words">Sensitive Words Page</div>,
}))
vi.mock('@/pages/admin/AuditLogPage', () => ({
  AuditLogPage: () => <div data-testid="page-audit-log">Audit Log Page</div>,
}))
vi.mock('@/pages/admin/DataExportPage', () => ({
  DataExportPage: () => <div data-testid="page-data-export">Data Export Page</div>,
}))
vi.mock('@/pages/notifications/OutboundQueuePage', () => ({
  OutboundQueuePage: () => <div data-testid="page-outbound-queue">Outbound Queue Page</div>,
}))
vi.mock('@/pages/DashboardPage', () => ({
  DashboardPage: () => <div data-testid="page-dashboard">Dashboard</div>,
}))

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

beforeEach(resetStores)
afterEach(resetStores)

// ── /admin/users (requires manageUsers — Admin only) ─────────────────────────

describe('TabContent /admin/users', () => {
  it('shows Access Denied for Participant', async () => {
    setRole(Role.Participant)
    openTab('/admin/users')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
    expect(screen.queryByTestId('page-user-management')).not.toBeInTheDocument()
  })

  it('shows Access Denied for ContentEditor', async () => {
    setRole(Role.ContentEditor)
    openTab('/admin/users')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
    expect(screen.queryByTestId('page-user-management')).not.toBeInTheDocument()
  })

  it('shows Access Denied for ReviewerApprover', async () => {
    setRole(Role.ReviewerApprover)
    openTab('/admin/users')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
    expect(screen.queryByTestId('page-user-management')).not.toBeInTheDocument()
  })

  it('renders the page for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/admin/users')
    render(<TabContent />)
    expect(await screen.findByTestId('page-user-management')).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })
})

// ── /admin/settings (requires manageSystem — Admin only) ────────────────────

describe('TabContent /admin/settings', () => {
  it('shows Access Denied for Participant', async () => {
    setRole(Role.Participant)
    openTab('/admin/settings')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
    expect(screen.queryByTestId('page-system-settings')).not.toBeInTheDocument()
  })

  it('shows Access Denied for ContentEditor', async () => {
    setRole(Role.ContentEditor)
    openTab('/admin/settings')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied for ReviewerApprover', async () => {
    setRole(Role.ReviewerApprover)
    openTab('/admin/settings')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('renders the page for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/admin/settings')
    render(<TabContent />)
    expect(await screen.findByTestId('page-system-settings')).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })
})

// ── /admin/sensitive-words (requires manageSystem — Admin only) ──────────────

describe('TabContent /admin/sensitive-words', () => {
  it('shows Access Denied for Participant', async () => {
    setRole(Role.Participant)
    openTab('/admin/sensitive-words')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
    expect(screen.queryByTestId('page-sensitive-words')).not.toBeInTheDocument()
  })

  it('renders the page for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/admin/sensitive-words')
    render(<TabContent />)
    expect(await screen.findByTestId('page-sensitive-words')).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })
})

// ── /admin/audit-log (requires viewAuditLog — Admin + Reviewer) ──────────────

describe('TabContent /admin/audit-log', () => {
  it('shows Access Denied for Participant', async () => {
    setRole(Role.Participant)
    openTab('/admin/audit-log')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
    expect(screen.queryByTestId('page-audit-log')).not.toBeInTheDocument()
  })

  it('shows Access Denied for ContentEditor', async () => {
    setRole(Role.ContentEditor)
    openTab('/admin/audit-log')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
    expect(screen.queryByTestId('page-audit-log')).not.toBeInTheDocument()
  })

  it('renders the page for ReviewerApprover', async () => {
    setRole(Role.ReviewerApprover)
    openTab('/admin/audit-log')
    render(<TabContent />)
    expect(await screen.findByTestId('page-audit-log')).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })

  it('renders the page for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/admin/audit-log')
    render(<TabContent />)
    expect(await screen.findByTestId('page-audit-log')).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })
})

// ── /admin/export (requires manageSystem — Admin only) ───────────────────────

describe('TabContent /admin/export', () => {
  it('shows Access Denied for Participant', async () => {
    setRole(Role.Participant)
    openTab('/admin/export')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
    expect(screen.queryByTestId('page-data-export')).not.toBeInTheDocument()
  })

  it('renders the page for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/admin/export')
    render(<TabContent />)
    expect(await screen.findByTestId('page-data-export')).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })
})

// ── /outbound-queue (requires manageMessages — Admin only) ───────────────────

describe('TabContent /outbound-queue', () => {
  it('shows Access Denied for Participant', async () => {
    setRole(Role.Participant)
    openTab('/outbound-queue')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
    expect(screen.queryByTestId('page-outbound-queue')).not.toBeInTheDocument()
  })

  it('shows Access Denied for ContentEditor', async () => {
    setRole(Role.ContentEditor)
    openTab('/outbound-queue')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied for ReviewerApprover', async () => {
    setRole(Role.ReviewerApprover)
    openTab('/outbound-queue')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('renders the page for Administrator', async () => {
    setRole(Role.Administrator)
    openTab('/outbound-queue')
    render(<TabContent />)
    expect(await screen.findByTestId('page-outbound-queue')).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })
})

// ── Unauthenticated user ──────────────────────────────────────────────────────

describe('TabContent — unauthenticated user', () => {
  it('shows Access Denied on /admin/users when no user is logged in', async () => {
    useAuthStore.setState({ currentUser: null, sessionId: null, isLoading: false, error: null })
    openTab('/admin/users')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied on /outbound-queue when no user is logged in', async () => {
    useAuthStore.setState({ currentUser: null, sessionId: null, isLoading: false, error: null })
    openTab('/outbound-queue')
    render(<TabContent />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })
})
