/**
 * Publish action permission tests.
 *
 * Verifies that:
 *   - Only Administrator holds `managePublications` (service requirement for publishPublication)
 *   - ContentEditor holds `createPublication` but NOT `managePublications`
 *   - ReviewerApprover holds `approvePublication` but NOT `managePublications`
 *   - The `usePermission('managePublications')` hook returns correct values per role,
 *     confirming the UI guards in PublicationListPage and ReviewDetailPage are aligned
 *     with the service-layer requirePermission('managePublications') check
 *
 * Evidence: src/pages/publishing/PublicationListPage.tsx (canPublish hook),
 *           src/pages/publishing/ReviewDetailPage.tsx (canPublish hook),
 *           src/services/publicationService.ts:299 (requirePermission('managePublications')),
 *           src/auth/permissions.ts (ROLE_PERMISSIONS matrix)
 */

import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { hasPermission } from '@/auth/permissions'
import { usePermission } from '@/hooks/usePermission'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'

// ── Role helper ───────────────────────────────────────────────────────────────

function setRole(role: Role) {
  useAuthStore.setState({
    currentUser: {
      id: `user-${role}`,
      username: role.toLowerCase(),
      displayName: role,
      role,
      isActive: true,
      createdAt: Date.now(),
    },
  } as Parameters<typeof useAuthStore.setState>[0])
}

// ── hasPermission matrix — managePublications ─────────────────────────────────

describe('hasPermission — managePublications (publish action gate)', () => {
  it('Administrator has managePublications', () => {
    expect(hasPermission(Role.Administrator, 'managePublications')).toBe(true)
  })

  it('ContentEditor does NOT have managePublications', () => {
    expect(hasPermission(Role.ContentEditor, 'managePublications')).toBe(false)
  })

  it('ReviewerApprover does NOT have managePublications', () => {
    expect(hasPermission(Role.ReviewerApprover, 'managePublications')).toBe(false)
  })

  it('Participant does NOT have managePublications', () => {
    expect(hasPermission(Role.Participant, 'managePublications')).toBe(false)
  })
})

// ── Verify ContentEditor role has correct publishing subset ───────────────────

describe('ContentEditor — publishing permission subset', () => {
  it('has createPublication (can draft and submit)', () => {
    expect(hasPermission(Role.ContentEditor, 'createPublication')).toBe(true)
  })

  it('does NOT have approvePublication (cannot review)', () => {
    expect(hasPermission(Role.ContentEditor, 'approvePublication')).toBe(false)
  })

  it('does NOT have managePublications (cannot publish)', () => {
    expect(hasPermission(Role.ContentEditor, 'managePublications')).toBe(false)
  })
})

// ── Verify ReviewerApprover role has correct publishing subset ────────────────

describe('ReviewerApprover — publishing permission subset', () => {
  it('has approvePublication (can review)', () => {
    expect(hasPermission(Role.ReviewerApprover, 'approvePublication')).toBe(true)
  })

  it('does NOT have createPublication (cannot draft)', () => {
    expect(hasPermission(Role.ReviewerApprover, 'createPublication')).toBe(false)
  })

  it('does NOT have managePublications (cannot publish)', () => {
    expect(hasPermission(Role.ReviewerApprover, 'managePublications')).toBe(false)
  })
})

// ── usePermission hook — confirms UI guard value matches permission matrix ─────

describe('usePermission("managePublications") hook', () => {
  it('returns true for Administrator', () => {
    setRole(Role.Administrator)
    const { result } = renderHook(() => usePermission('managePublications'))
    expect(result.current).toBe(true)
  })

  it('returns false for ContentEditor', () => {
    setRole(Role.ContentEditor)
    const { result } = renderHook(() => usePermission('managePublications'))
    expect(result.current).toBe(false)
  })

  it('returns false for ReviewerApprover', () => {
    setRole(Role.ReviewerApprover)
    const { result } = renderHook(() => usePermission('managePublications'))
    expect(result.current).toBe(false)
  })

  it('returns false for Participant', () => {
    setRole(Role.Participant)
    const { result } = renderHook(() => usePermission('managePublications'))
    expect(result.current).toBe(false)
  })
})
