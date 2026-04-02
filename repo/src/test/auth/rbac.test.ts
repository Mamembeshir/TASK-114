/**
 * RBAC — permission matrix correctness.
 *
 * Verifies that every role has exactly the rights specified in the permission
 * matrix (CLAUDE.md §12 / README §Permission Matrix) and that `hasPermission`
 * and `requirePermission` enforce those boundaries correctly.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { hasPermission, Permission } from '@/auth/permissions'
import { requirePermission } from '@/utils/permissions'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

// ── helpers ────────────────────────────────────────────────────────────────────

function makeUser(role: Role) {
  return {
    id: `user-${role}`,
    username: role.toLowerCase(),
    displayName: role,
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

// ── hasPermission — explicit allow-list tests ──────────────────────────────────

describe('hasPermission — Administrator', () => {
  const r = Role.Administrator

  it('can manage users', () => {
    expect(hasPermission(r, Permission.manageUsers)).toBe(true)
  })
  it('can manage system', () => {
    expect(hasPermission(r, Permission.manageSystem)).toBe(true)
  })
  it('can view audit log', () => {
    expect(hasPermission(r, Permission.viewAuditLog)).toBe(true)
  })
  it('can create auctions', () => {
    expect(hasPermission(r, Permission.createAuction)).toBe(true)
  })
  it('can place bids', () => {
    expect(hasPermission(r, Permission.placeBid)).toBe(true)
  })
  it('can manage wallets', () => {
    expect(hasPermission(r, Permission.manageWallets)).toBe(true)
  })
  it('can approve publications', () => {
    expect(hasPermission(r, Permission.approvePublication)).toBe(true)
  })
  it('can approve documents', () => {
    expect(hasPermission(r, Permission.approveDocument)).toBe(true)
  })
  it('can approve destruction', () => {
    expect(hasPermission(r, Permission.approveDestruction)).toBe(true)
  })
  it('can manage messages', () => {
    expect(hasPermission(r, Permission.manageMessages)).toBe(true)
  })
})

describe('hasPermission — ContentEditor', () => {
  const r = Role.ContentEditor

  it('can create auctions', () => {
    expect(hasPermission(r, Permission.createAuction)).toBe(true)
  })
  it('can create catalog items', () => {
    expect(hasPermission(r, Permission.createCatalogItem)).toBe(true)
  })
  it('can create publications', () => {
    expect(hasPermission(r, Permission.createPublication)).toBe(true)
  })
  it('can create documents', () => {
    expect(hasPermission(r, Permission.createDocument)).toBe(true)
  })
  it('can checkout documents', () => {
    expect(hasPermission(r, Permission.checkoutDocument)).toBe(true)
  })
  it('can view messages', () => {
    expect(hasPermission(r, Permission.viewMessages)).toBe(true)
  })

  // Denied
  it('cannot manage users', () => {
    expect(hasPermission(r, Permission.manageUsers)).toBe(false)
  })
  it('cannot place bids', () => {
    expect(hasPermission(r, Permission.placeBid)).toBe(false)
  })
  it('cannot approve publications', () => {
    expect(hasPermission(r, Permission.approvePublication)).toBe(false)
  })
  it('cannot manage wallets', () => {
    expect(hasPermission(r, Permission.manageWallets)).toBe(false)
  })
  it('cannot approve destruction', () => {
    expect(hasPermission(r, Permission.approveDestruction)).toBe(false)
  })
})

describe('hasPermission — ReviewerApprover', () => {
  const r = Role.ReviewerApprover

  it('can view audit log', () => {
    expect(hasPermission(r, Permission.viewAuditLog)).toBe(true)
  })
  it('can approve publications', () => {
    expect(hasPermission(r, Permission.approvePublication)).toBe(true)
  })
  it('can approve documents', () => {
    expect(hasPermission(r, Permission.approveDocument)).toBe(true)
  })
  it('can approve destruction', () => {
    expect(hasPermission(r, Permission.approveDestruction)).toBe(true)
  })
  it('can moderate catalog', () => {
    expect(hasPermission(r, Permission.moderateCatalogItem)).toBe(true)
  })

  // Denied
  it('cannot create auctions', () => {
    expect(hasPermission(r, Permission.createAuction)).toBe(false)
  })
  it('cannot place bids', () => {
    expect(hasPermission(r, Permission.placeBid)).toBe(false)
  })
  it('cannot manage users', () => {
    expect(hasPermission(r, Permission.manageUsers)).toBe(false)
  })
  it('cannot manage system', () => {
    expect(hasPermission(r, Permission.manageSystem)).toBe(false)
  })
  it('cannot create publications', () => {
    expect(hasPermission(r, Permission.createPublication)).toBe(false)
  })
})

describe('hasPermission — Participant', () => {
  const r = Role.Participant

  it('can view auctions', () => {
    expect(hasPermission(r, Permission.viewAuctions)).toBe(true)
  })
  it('can place bids', () => {
    expect(hasPermission(r, Permission.placeBid)).toBe(true)
  })
  it('can view catalog', () => {
    expect(hasPermission(r, Permission.viewCatalog)).toBe(true)
  })
  it('can view publications', () => {
    expect(hasPermission(r, Permission.viewPublications)).toBe(true)
  })
  it('can checkout documents', () => {
    expect(hasPermission(r, Permission.checkoutDocument)).toBe(true)
  })
  it('can view messages', () => {
    expect(hasPermission(r, Permission.viewMessages)).toBe(true)
  })

  // Denied — all staff-only capabilities
  it('cannot manage users', () => {
    expect(hasPermission(r, Permission.manageUsers)).toBe(false)
  })
  it('cannot create auctions', () => {
    expect(hasPermission(r, Permission.createAuction)).toBe(false)
  })
  it('cannot create publications', () => {
    expect(hasPermission(r, Permission.createPublication)).toBe(false)
  })
  it('cannot approve publications', () => {
    expect(hasPermission(r, Permission.approvePublication)).toBe(false)
  })
  it('cannot create documents', () => {
    expect(hasPermission(r, Permission.createDocument)).toBe(false)
  })
  it('cannot approve documents', () => {
    expect(hasPermission(r, Permission.approveDocument)).toBe(false)
  })
  it('cannot approve destruction', () => {
    expect(hasPermission(r, Permission.approveDestruction)).toBe(false)
  })
  it('cannot view audit log', () => {
    expect(hasPermission(r, Permission.viewAuditLog)).toBe(false)
  })
  it('cannot manage system', () => {
    expect(hasPermission(r, Permission.manageSystem)).toBe(false)
  })
  it('cannot manage wallets', () => {
    expect(hasPermission(r, Permission.manageWallets)).toBe(false)
  })
})

// ── requirePermission — service-layer guard ────────────────────────────────────

describe('requirePermission', () => {
  afterEach(() => {
    // Restore admin user set in global setup
    useAuthStore.setState({
      currentUser: makeUser(Role.Administrator),
      sessionId: 'test-session',
      isLoading: false,
      error: null,
    })
  })

  it('allows when user has the required permission', () => {
    useAuthStore.setState({ currentUser: makeUser(Role.ContentEditor) })
    expect(() => {
      requirePermission(Permission.createAuction)
    }).not.toThrow()
  })

  it('throws when user lacks the required permission', () => {
    useAuthStore.setState({ currentUser: makeUser(Role.Participant) })
    expect(() => {
      requirePermission(Permission.createAuction)
    }).toThrow(/Forbidden/)
  })

  it('throws when there is no authenticated user', () => {
    useAuthStore.setState({ currentUser: null })
    expect(() => {
      requirePermission(Permission.createAuction)
    }).toThrow(/Forbidden/)
  })

  it('Participant can placeBid but not createAuction', () => {
    useAuthStore.setState({ currentUser: makeUser(Role.Participant) })
    expect(() => {
      requirePermission(Permission.placeBid)
    }).not.toThrow()
    expect(() => {
      requirePermission(Permission.createAuction)
    }).toThrow(/Forbidden/)
  })

  it('Reviewer can approvePublication but not createPublication', () => {
    useAuthStore.setState({ currentUser: makeUser(Role.ReviewerApprover) })
    expect(() => {
      requirePermission(Permission.approvePublication)
    }).not.toThrow()
    expect(() => {
      requirePermission(Permission.createPublication)
    }).toThrow(/Forbidden/)
  })
})
