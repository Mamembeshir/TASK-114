/**
 * Tests for document destruction two-step approval workflow.
 *
 * Covers:
 *  - Happy path: Reviewer → Admin → document Destroyed
 *  - Admin cannot skip reviewer step
 *  - Role separation: same person cannot fill both reviewer and admin roles
 *  - Wrong role rejected at reviewer step (non-ReviewerApprover)
 *  - Wrong role rejected at admin step (non-Administrator)
 *  - Reject destruction: reverts document to Approved
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/db'
import {
  createDocument,
  requestDestruction,
  reviewerApproveDestruction,
  adminApproveDestruction,
  rejectDestruction,
} from '@/services/documentService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'
import type { User } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDbUser(id: string, role: Role): User {
  return {
    id,
    username: id,
    displayName: id,
    email: `${id}@test`,
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

function setAuth(user: User) {
  useAuthStore.setState({ currentUser: user, isLoading: false })
}

const ADMIN = makeDbUser('admin-1', Role.Administrator)
const REVIEWER = makeDbUser('reviewer-1', Role.ReviewerApprover)

async function seedUsers() {
  await db.users.bulkPut([ADMIN, REVIEWER])
}

async function createApprovedDoc(): Promise<string> {
  // createDocument requires createDocument permission — admin has it via the global setup
  const doc = await createDocument(
    {
      title: 'Destroy Me',
      type: 'Policy' as const,
      categoryId: 'cat-1',
      body: '<p>content</p>',
      attachmentUrls: [],
      retentionYears: 5,
      tags: [],
      metadata: {},
    },
  )
  // Bypass the full approval workflow — put document directly into Approved status
  // Set retentionDueDate in the past so destruction is allowed
  await db.documents.update(doc.id, { status: 'Approved', retentionDueDate: Date.now() - 1000 })
  return doc.id
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.users.clear(),
    db.documents.clear(),
    db.documentVersions.clear(),
    db.destructionApprovals.clear(),
    db.notifications.clear(),
    db.auditLogs.clear(),
  ])
  await seedUsers()
  setAuth(ADMIN)
})

afterEach(() => {
  setAuth(ADMIN)
})

// ── Happy path ────────────────────────────────────────────────────────────────

describe('documentDestruction — happy path', () => {
  it('full two-step approval destroys the document', async () => {
    const docId = await createApprovedDoc()

    // Step 0: Admin requests destruction
    await requestDestruction(docId, 'Retention period expired')

    const approval = await db.destructionApprovals.where('documentId').equals(docId).first()
    expect(approval).toBeDefined()
    expect(approval!.status).toBe('Pending')

    // Step 1: Reviewer approves
    setAuth(REVIEWER)
    await reviewerApproveDestruction(approval!.id)

    const afterReview = await db.destructionApprovals.get(approval!.id)
    expect(afterReview!.status).toBe('ReviewerApproved')
    expect(afterReview!.reviewerApprovedBy).toBe(REVIEWER.id)

    // Step 2: Admin gives final approval
    setAuth(ADMIN)
    await adminApproveDestruction(approval!.id)

    const afterAdmin = await db.destructionApprovals.get(approval!.id)
    expect(afterAdmin!.status).toBe('FullyApproved')

    const destroyedDoc = await db.documents.get(docId)
    expect(destroyedDoc!.status).toBe('Destroyed')
  })
})

// ── Admin cannot skip reviewer step ──────────────────────────────────────────

describe('documentDestruction — reviewer step is mandatory', () => {
  it('throws when admin tries to approve before the reviewer step', async () => {
    const docId = await createApprovedDoc()
    await requestDestruction(docId, 'Test')

    const approval = await db.destructionApprovals.where('documentId').equals(docId).first()

    // Attempt final approval without reviewer step → status is still 'Pending'
    await expect(
      adminApproveDestruction(approval!.id),
    ).rejects.toThrow(/Reviewer approval required first/i)

    const doc = await db.documents.get(docId)
    expect(doc!.status).toBe('PendingDestruction') // unchanged
  })
})

// ── Role separation violation ─────────────────────────────────────────────────

describe('documentDestruction — role separation', () => {
  it('throws when the same person tries to fill both reviewer and admin roles', async () => {
    const docId = await createApprovedDoc()
    await requestDestruction(docId, 'Test')

    const approval = await db.destructionApprovals.where('documentId').equals(docId).first()

    // Reviewer step done by reviewer-1
    setAuth(REVIEWER)
    await reviewerApproveDestruction(approval!.id)

    // Create a special user who is Administrator but has the same ID as the reviewer
    // — this directly exercises the same-person check
    const reviewerAsAdmin = makeDbUser(REVIEWER.id, Role.Administrator)
    await db.users.put(reviewerAsAdmin)
    setAuth(reviewerAsAdmin)

    await expect(
      adminApproveDestruction(approval!.id),
    ).rejects.toThrow(/Role separation violation/i)

    const doc = await db.documents.get(docId)
    expect(doc!.status).toBe('PendingDestruction') // not destroyed
  })
})

// ── Wrong role at reviewer step ───────────────────────────────────────────────

describe('documentDestruction — wrong role at reviewer step', () => {
  it('throws when a ContentEditor tries to perform the reviewer step', async () => {
    const editor = makeDbUser('editor-1', Role.ContentEditor)
    await db.users.put(editor)

    const docId = await createApprovedDoc()
    await requestDestruction(docId, 'Test')
    const approval = await db.destructionApprovals.where('documentId').equals(docId).first()

    // ContentEditor does not have approveDocument permission — expect Forbidden from requirePermission
    const editorAuth = makeDbUser('editor-1', Role.ContentEditor)
    setAuth(editorAuth)

    await expect(
      reviewerApproveDestruction(approval!.id),
    ).rejects.toThrow(/Forbidden/)
  })

  it('throws when an Administrator calls reviewerApproveDestruction (wrong role in DB)', async () => {
    // Admin has approveDocument permission but DB role check requires ReviewerApprover
    const docId = await createApprovedDoc()
    await requestDestruction(docId, 'Test')
    const approval = await db.destructionApprovals.where('documentId').equals(docId).first()

    // Auth store is already Administrator; actorId points to ADMIN who has role=Administrator in DB
    await expect(
      reviewerApproveDestruction(approval!.id),
    ).rejects.toThrow(/only a ReviewerApprover may perform the reviewer step/i)
  })
})

// ── Wrong role at admin step ──────────────────────────────────────────────────

describe('documentDestruction — wrong role at admin step', () => {
  it('throws when a ReviewerApprover tries to perform the admin step', async () => {
    const docId = await createApprovedDoc()
    await requestDestruction(docId, 'Test')
    const approval = await db.destructionApprovals.where('documentId').equals(docId).first()

    // Reviewer approves step 1
    setAuth(REVIEWER)
    await reviewerApproveDestruction(approval!.id)

    // Reviewer now tries the admin step — no approveDestruction permission
    await expect(
      adminApproveDestruction(approval!.id),
    ).rejects.toThrow(/Forbidden/)
  })
})

// ── Reject destruction ────────────────────────────────────────────────────────

describe('documentDestruction — rejection', () => {
  it('rejects a pending destruction request and reverts doc to Approved', async () => {
    const docId = await createApprovedDoc()
    await requestDestruction(docId, 'Test')
    const approval = await db.destructionApprovals.where('documentId').equals(docId).first()

    await rejectDestruction(approval!.id, 'Not ready for destruction')

    const updated = await db.destructionApprovals.get(approval!.id)
    expect(updated!.status).toBe('Rejected')
    expect(updated!.rejectionReason).toBe('Not ready for destruction')

    const doc = await db.documents.get(docId)
    expect(doc!.status).toBe('Approved') // reverted
  })
})

// ── Retention period precondition ────────────────────────────────────────────

describe('documentDestruction — retention period precondition', () => {
  it('rejects destruction request when retention period has not elapsed', async () => {
    const doc = await createDocument({
      title: 'Too Early',
      type: 'Policy' as const,
      categoryId: 'cat-1',
      body: '<p>content</p>',
      attachmentUrls: [],
      retentionYears: 5,
      tags: [],
      metadata: {},
    })
    // Set retentionDueDate in the future
    await db.documents.update(doc.id, {
      status: 'Approved',
      retentionDueDate: Date.now() + 365 * 24 * 3600 * 1000,
    })

    await expect(
      requestDestruction(doc.id, 'Trying too early'),
    ).rejects.toThrow(/retention period/)
  })

  it('allows destruction request when retention period has elapsed', async () => {
    const doc = await createDocument({
      title: 'Ready to Destroy',
      type: 'Policy' as const,
      categoryId: 'cat-1',
      body: '<p>content</p>',
      attachmentUrls: [],
      retentionYears: 5,
      tags: [],
      metadata: {},
    })
    // Set retentionDueDate in the past
    await db.documents.update(doc.id, {
      status: 'Approved',
      retentionDueDate: Date.now() - 1000,
    })

    await requestDestruction(doc.id, 'Retention period expired')

    const approval = await db.destructionApprovals.where('documentId').equals(doc.id).first()
    expect(approval).toBeDefined()
    expect(approval!.status).toBe('Pending')
  })
})
